/**
 * POST /api/dashboard/admin/reload
 *
 * Runs `~/.agent-machines/scripts/reload-from-git.sh` on the live
 * machine via Dedalus exec. The script does a shallow git fetch + reset
 * on the agent-machines repo checkout under /home/machine/ and re-syncs
 * `knowledge/skills`, `knowledge/crons`, and the persona files into
 * `~/.agent-machines/`.
 *
 * This is the "edit on GitHub, click reload, agent picks it up" flow --
 * the persistence story for skills, crons, MEMORY.md, USER.md, etc.
 * without ever needing to run the local CLI.
 *
 * Resolves the target machine from the caller's Clerk metadata. Users
 * who haven't provisioned a machine yet get a typed `not_provisioned`
 * envelope; users whose machine is asleep get `machine_offline`.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import { execOnMachine, isMachineRunning } from "@/lib/dashboard/exec";
import { getUserConfig } from "@/lib/user-config/clerk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RELOAD_SCRIPT = "$HOME/.agent-machines/scripts/reload-from-git.sh";

export async function POST(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const config = await getUserConfig();
	const active = config.machines.find((m) => m.id === config.activeMachineId);
	if (!active || !config.providers.dedalus?.apiKey) {
		return Response.json(
			{
				error: "not_provisioned",
				message:
					"No active machine configured. Complete /dashboard/setup first.",
			},
			{ status: 404 },
		);
	}

	if (!(await isMachineRunning())) {
		return Response.json(
			{
				error: "machine_offline",
				message: "Machine is not running. Wake it from /dashboard first.",
			},
			{ status: 503 },
		);
	}

	try {
		const result = await execOnMachine(
			`if [ -x ${RELOAD_SCRIPT} ]; then ${RELOAD_SCRIPT}; else echo "reload script not installed; redeploy required" >&2; exit 2; fi`,
			{ timeoutMs: 60_000 },
		);
		const headLine = result.stdout
			.split("\n")
			.find((line) => line.startsWith("[reload] HEAD:"));
		const head = headLine
			? headLine.replace("[reload] HEAD:", "").trim()
			: null;
		return Response.json(
			{
				ok: result.exitCode === 0,
				head,
				stdout: result.stdout,
				stderr: result.stderr,
				reloadedAt: new Date().toISOString(),
			},
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : "reload failed";
		return Response.json(
			{ error: "reload_failed", message },
			{ status: 502 },
		);
	}
}
