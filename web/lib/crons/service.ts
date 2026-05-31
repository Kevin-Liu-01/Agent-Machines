/**
 * Server-side cron execution.
 *
 * Crons are stored per-user in config (`config.crons`). The scheduler tick
 * (`/api/internal/cron/tick`) and the "run now" route both run a cron by
 * exec-ing the agent one-shot on the bound machine, via the provider
 * primitive directly so it works without a request session.
 *
 * The executed command also appends a JSON line to
 * `~/.agent-machines/cron/runs.jsonl` on the box, so the machine keeps an
 * authoritative run log independent of the dashboard.
 */

import { getProvider } from "@/lib/providers";
import { resolveMachine } from "@/lib/dashboard/exec";
import { agentOneShotInvocation } from "@/lib/dashboard/agent-launch";
import type { CronEntry, CronStatus, UserConfig } from "@/lib/user-config/schema";
import { cronIsDueSince } from "@/lib/cron/expr";

const RUN_DIR = "$HOME/.agent-machines/cron";
const RUN_LOG = `${RUN_DIR}/runs.jsonl`;
const RUN_TIMEOUT_MS = 120_000;

/** The "armed from" baseline: last successful run, else creation time. */
export function cronBaselineMs(cron: CronEntry): number | null {
	const last = cron.lastRunAt ? Date.parse(cron.lastRunAt) : NaN;
	if (Number.isFinite(last)) return last;
	const created = cron.createdAt ? Date.parse(cron.createdAt) : NaN;
	return Number.isFinite(created) ? created : null;
}

/** Enabled crons whose schedule became due at or before `nowMs`. */
export function listDueCrons(config: UserConfig, nowMs: number): CronEntry[] {
	return (config.crons ?? []).filter((cron) => {
		if (!cron.enabled) return false;
		const machine = config.machines.find((m) => m.id === cron.machineId);
		if (!machine || machine.archived) return false;
		return cronIsDueSince(cron.schedule, cronBaselineMs(cron), nowMs);
	});
}

/**
 * Build the shell command that runs one cron: decode the prompt, invoke the
 * agent headlessly, capture output to a per-cron log, and append a run
 * record to runs.jsonl. Echoes `AM_CRON_EXIT:<code>` so a waiting caller can
 * read the outcome.
 */
export function buildCronCommand(cron: CronEntry, agentKind: string): string {
	const promptB64 = Buffer.from(cron.prompt ?? "", "utf8").toString("base64");
	const invocation =
		agentOneShotInvocation(agentKind) ??
		'echo "no one-shot runner for this agent; prompt:"; echo "$AM_CRON_PROMPT"';
	const logFile = `${RUN_DIR}/${cron.id}.last.log`;
	return [
		`mkdir -p "${RUN_DIR}"`,
		`export AM_CRON_PROMPT="$(printf %s '${promptB64}' | base64 -d 2>/dev/null)"`,
		`__am_start=$(date -u +%Y-%m-%dT%H:%M:%SZ)`,
		`( ${invocation} ) > "${logFile}" 2>&1`,
		`__am_code=$?`,
		`__am_end=$(date -u +%Y-%m-%dT%H:%M:%SZ)`,
		`printf '{"id":"%s","startedAt":"%s","finishedAt":"%s","exitCode":%s}\\n' '${cron.id}' "$__am_start" "$__am_end" "$__am_code" >> "${RUN_LOG}"`,
		`echo "AM_CRON_EXIT:$__am_code"`,
	].join("\n");
}

export type CronRunResult = {
	ok: boolean;
	status: CronStatus;
	exitCode?: number;
	output?: string;
	message?: string;
};

/**
 * Run a cron on its bound machine. With `wait`, blocks for the agent and
 * reports the real exit status; otherwise dispatches in the background and
 * reports "running" (the scheduler uses this so a slow agent never stalls
 * the tick).
 */
export async function runCronOnMachine(
	config: UserConfig,
	cron: CronEntry,
	opts: { wait?: boolean } = {},
): Promise<CronRunResult> {
	const machine = resolveMachine(config, cron.machineId);
	if (!machine) {
		return { ok: false, status: "failed", message: "machine_not_found" };
	}
	const provider = getProvider(machine.providerKind, config.providers);
	const command = buildCronCommand(cron, machine.agentKind);

	if (opts.wait) {
		try {
			const res = await provider.exec(machine.id, command, {
				timeoutMs: RUN_TIMEOUT_MS,
			});
			const m = res.stdout.match(/AM_CRON_EXIT:(\d+)/);
			const code = m ? Number.parseInt(m[1], 10) : res.exitCode ?? 1;
			return {
				ok: true,
				status: code === 0 ? "success" : "failed",
				exitCode: code,
				output: res.stdout,
			};
		} catch (err) {
			return {
				ok: false,
				status: "failed",
				message: err instanceof Error ? err.message : "exec_failed",
			};
		}
	}

	// Fire-and-forget: prefer a real background exec; otherwise kick it off
	// without awaiting so the scheduler tick returns promptly. Offline
	// machines surface here as a thrown exec — report failed rather than
	// letting it bubble and abort a multi-cron tick.
	try {
		if (typeof provider.execBackground === "function") {
			await provider.execBackground(machine.id, command);
		} else {
			void provider
				.exec(machine.id, command, { timeoutMs: RUN_TIMEOUT_MS })
				.catch(() => {});
		}
		return { ok: true, status: "running" };
	} catch (err) {
		return {
			ok: false,
			status: "failed",
			message: err instanceof Error ? err.message : "dispatch_failed",
		};
	}
}
