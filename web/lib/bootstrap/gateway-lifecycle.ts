/**
 * Keep agent gateways alive across wake/sleep and expose stable URLs.
 */

import type { MachineProvider } from "@/lib/providers";
import type { MachineRef } from "@/lib/user-config/schema";

const HERMES_PORT = 8642;
const OPENCLAW_PORT = 18789;

type GatewayPaths = {
	HOME: string;
	HERMES_HOME: string;
	OPENCLAW_HOME: string;
	NPM_PREFIX: string;
	NPM_CACHE: string;
	PLAYWRIGHT_BROWSERS: string;
	AGENT_BROWSER_HOME: string;
	MACHINE_HOME: string;
};

function pathsFor(providerKind: MachineRef["providerKind"]): GatewayPaths {
	const HOME =
		providerKind === "e2b" ? "/home/user" :
		providerKind === "sprites" ? "/home/sprite" :
		"/home/machine";
	return {
		HOME,
		HERMES_HOME: `${HOME}/.agent-machines`,
		OPENCLAW_HOME: `${HOME}/.openclaw`,
		NPM_PREFIX: `${HOME}/.npm-global`,
		NPM_CACHE: `${HOME}/.npm-cache`,
		PLAYWRIGHT_BROWSERS: `${HOME}/.cache/ms-playwright`,
		AGENT_BROWSER_HOME: `${HOME}/.agent-browser`,
		MACHINE_HOME: `${HOME}/.machine`,
	};
}

function hermesEnv(p: GatewayPaths): string {
	return [
		`export HOME=${p.HOME}`,
		`export HERMES_HOME=${p.HERMES_HOME}`,
		`export NPM_CONFIG_PREFIX=${p.NPM_PREFIX}`,
		`export NPM_CONFIG_CACHE=${p.NPM_CACHE}`,
		`export PLAYWRIGHT_BROWSERS_PATH=${p.PLAYWRIGHT_BROWSERS}`,
		`export AGENT_BROWSER_DATA_DIR=${p.AGENT_BROWSER_HOME}`,
		`export PATH=${p.NPM_PREFIX}/bin:${p.HERMES_HOME}/venv/bin:${p.HOME}/.local/bin:$PATH`,
	].join(" && ");
}

function openClawEnv(p: GatewayPaths): string {
	return [
		`export HOME=${p.HOME}`,
		`export NPM_CONFIG_CACHE=${p.NPM_CACHE}`,
		`export PLAYWRIGHT_BROWSERS_PATH=${p.PLAYWRIGHT_BROWSERS}`,
		`export AGENT_BROWSER_DATA_DIR=${p.AGENT_BROWSER_HOME}`,
		`export PATH=${p.NPM_PREFIX}/bin:${p.HOME}/.npm-global/bin:$PATH`,
		`export OPENCLAW_STATE_DIR=${p.OPENCLAW_HOME}`,
		`export OPENCLAW_NO_RESPAWN=1`,
	].join(" && ");
}

function gatewayPort(machine: MachineRef): number {
	if (machine.providerKind === "sprites") return 8080;
	if (machine.agentKind === "openclaw") return OPENCLAW_PORT;
	return HERMES_PORT;
}

const HERMES_GATEWAY_UNIT = "agent-hermes-gateway.service";
const OPENCLAW_GATEWAY_UNIT = "agent-openclaw-gateway.service";

function gatewayUnit(machine: MachineRef): string {
	return machine.agentKind === "openclaw" ? OPENCLAW_GATEWAY_UNIT : HERMES_GATEWAY_UNIT;
}

function gatewayStartScript(machine: MachineRef, p: GatewayPaths): string {
	return machine.agentKind === "openclaw"
		? `${p.HOME}/start-openclaw-gateway.sh`
		: `${p.HOME}/start-hermes-gateway.sh`;
}

export function installGatewayUnitCommand(
	machine: MachineRef,
	p: GatewayPaths,
): string {
	const unit = gatewayUnit(machine);
	const script = gatewayStartScript(machine, p);
	const unitPath = `/etc/systemd/system/${unit}`;
	return [
		`cat > ${unitPath} <<'UNITEOF'`,
		"[Unit]",
		`Description=Agent Machines ${machine.agentKind} gateway`,
		"After=network.target",
		"",
		"[Service]",
		"Type=simple",
		`WorkingDirectory=${p.HOME}`,
		`ExecStart=${script}`,
		"Restart=always",
		"RestartSec=5",
		`Environment=HOME=${p.HOME}`,
		"",
		"[Install]",
		"WantedBy=multi-user.target",
		"UNITEOF",
		"systemctl daemon-reload",
		`systemctl enable ${unit}`,
		`systemctl restart ${unit}`,
	].join("\n");
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Restart the gateway via systemd when possible, otherwise fall back to the
 * start script written during bootstrap.
 */
export async function ensureGatewayRunning(
	machine: MachineRef,
	provider: MachineProvider,
): Promise<void> {
	if (machine.agentKind === "claude-code" || machine.agentKind === "codex") {
		return;
	}

	const p = pathsFor(machine.providerKind);
	const port = gatewayPort(machine);
	const env = machine.agentKind === "openclaw" ? openClawEnv(p) : hermesEnv(p);
	const unit = gatewayUnit(machine);
	const installUnit = installGatewayUnitCommand(machine, p);

	const probe = await provider.exec(
		machine.id,
		`ss -tln 2>/dev/null | grep -q ":${port} " && echo up || echo down`,
		{ timeoutMs: 10_000 },
	);
	if (probe.stdout.trim() === "up") return;

	await provider.exec(
		machine.id,
		[
			"set -e",
			env,
			installUnit,
			"sleep 10",
			`ss -tln | grep ":${port} "`,
		].join("\n"),
		{ timeoutMs: 120_000 },
	);
}

/** Poll a public gateway URL until /v1/models returns 200. */
export async function waitForGatewayUrl(
	apiUrl: string,
	apiKey: string,
	options?: {
		maxAttempts?: number;
		/** When set, also accept in-VM localhost probe (more reliable than preview tunnels). */
		provider?: MachineProvider;
		machineId?: string;
		localPort?: number;
	},
): Promise<void> {
	const maxAttempts = options?.maxAttempts ?? 30;
	const base = apiUrl.replace(/\/$/, "");
	const modelsUrl = base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		let externalOk = false;
		try {
			const response = await fetch(modelsUrl, {
				headers: { Authorization: `Bearer ${apiKey}` },
				cache: "no-store",
			});
			externalOk = response.ok;
			if (externalOk) return;
		} catch {
			// Preview tunnel may still be connecting.
		}

		if (options?.provider && options?.machineId && options?.localPort) {
			const local = await probeGatewayLocal(
				options.provider,
				options.machineId,
				options.localPort,
				apiKey,
			).catch(() => false);
			if (local) return;
		}

		await sleep(2_000);
	}
	throw new Error(`Gateway URL not ready after ${maxAttempts} attempts: ${modelsUrl}`);
}

async function probeGatewayLocal(
	provider: MachineProvider,
	machineId: string,
	port: number,
	apiKey: string,
): Promise<boolean> {
	const result = await provider.exec(
		machineId,
		[
			"set -e",
			`code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer ${apiKey}' http://127.0.0.1:${port}/v1/models || echo 000)`,
			'echo "$code"',
		].join("\n"),
		{ timeoutMs: 15_000 },
	);
	return result.stdout.trim() === "200";
}

/** Probe public URL, falling back to in-VM localhost when preview tunnels fail. */
export async function probeGateway(args: {
	apiUrl: string;
	apiKey: string;
	provider?: MachineProvider;
	machineId?: string;
	localPort?: number;
}): Promise<{ ok: boolean; status: number; modelCount: number | null; error?: string }> {
	const base = args.apiUrl.replace(/\/$/, "");
	const modelsUrl = base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`;

	try {
		const response = await fetch(modelsUrl, {
			headers: { Authorization: `Bearer ${args.apiKey}` },
			cache: "no-store",
		});
		let modelCount: number | null = null;
		if (response.ok) {
			try {
				const body = (await response.json()) as { data?: unknown[] };
				if (Array.isArray(body.data)) modelCount = body.data.length;
			} catch {
				// non-json body
			}
			return { ok: true, status: response.status, modelCount };
		}
		if (args.provider && args.machineId && args.localPort) {
			const local = await probeGatewayLocal(
				args.provider,
				args.machineId,
				args.localPort,
				args.apiKey,
			).catch(() => false);
			if (local) return { ok: true, status: 200, modelCount: null };
		}
		return { ok: false, status: response.status, modelCount: null };
	} catch (err) {
		if (args.provider && args.machineId && args.localPort) {
			const local = await probeGatewayLocal(
				args.provider,
				args.machineId,
				args.localPort,
				args.apiKey,
			).catch(() => false);
			if (local) return { ok: true, status: 200, modelCount: null };
		}
		return {
			ok: false,
			status: 0,
			modelCount: null,
			error: err instanceof Error ? err.message : "fetch_failed",
		};
	}
}
