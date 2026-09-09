/**
 * Detect missing bootstrap artifacts after sleep/wake and repair gateway.
 */

import type { MachineProvider } from "@/lib/providers";
import type { MachineRef } from "@/lib/user-config/schema";

import { finalizeGatewayBootstrap } from "./runner";

function homeFor(providerKind: MachineRef["providerKind"]): string {
	if (providerKind === "e2b") return "/home/user";
	if (providerKind === "sprites") return "/home/sprite";
	if (providerKind === "vercel") return "/vercel/sandbox";
	return "/home/machine";
}

function pathExports(home: string): string {
	return `export PATH=${home}/.agent-machines/node/bin:${home}/.agent-machines/pkgs/node_modules/.bin:${home}/.npm-global/bin:${home}/.local/bin:$PATH`;
}

/** Check agent install artifacts on disk (per runtime). */
export async function agentArtifactsPresent(
	machine: MachineRef,
	provider: MachineProvider,
): Promise<boolean> {
	const home = homeFor(machine.providerKind);
	const appHome = `${home}/.agent-machines`;

	if (machine.agentKind === "claude-code") {
		const probe = await provider.exec(
			machine.id,
			[
				pathExports(home),
				"command -v claude >/dev/null 2>&1",
				`test -f ${appHome}/.agent-env`,
				"echo ok",
			].join(" && "),
			{ timeoutMs: 15_000 },
		);
		return probe.stdout.trim() === "ok";
	}

	if (machine.agentKind === "codex") {
		const probe = await provider.exec(
			machine.id,
			[
				pathExports(home),
				"command -v codex >/dev/null 2>&1",
				`test -f ${appHome}/.agent-env`,
				"echo ok",
			].join(" && "),
			{ timeoutMs: 15_000 },
		);
		return probe.stdout.trim() === "ok";
	}

	if (machine.agentKind === "openclaw") {
		const openclawHome = `${home}/.openclaw`;
		const probe = await provider.exec(
			machine.id,
			[
				pathExports(home),
				"command -v openclaw >/dev/null 2>&1",
				`test -f ${openclawHome}/.env`,
				"echo ok",
			].join(" && "),
			{ timeoutMs: 15_000 },
		);
		return probe.stdout.trim() === "ok";
	}

	const envFile = `${appHome}/.env`;
	const probe = await provider.exec(
		machine.id,
		[
			pathExports(home),
			// The pinned uv tool install exposes ~/.local/bin/hermes, while
			// older Workers use the durable venv and pre-baked images use /opt.
			// These are the same paths accepted by the managed Hermes launcher.
			`export PATH=${appHome}/venv/bin:/opt/hermes/bin:$PATH`,
			'test -x "$(command -v hermes)"',
			`test -f ${envFile}`,
			"echo ok",
		].join(" && "),
		{ timeoutMs: 15_000 },
	);
	return probe.exitCode === 0 && probe.stdout.trim() === "ok";
}

/** True when gateway/CLI files are absent but the machine should already be bootstrapped. */
export async function needsBootstrapRepair(
	machine: MachineRef,
	provider: MachineProvider,
): Promise<boolean> {
	const shouldHaveAgent =
		machine.bootstrapState.phase === "succeeded" ||
		Boolean(machine.apiUrl) ||
		machine.bootstrapState.completed.length > 0;
	if (!shouldHaveAgent) return false;
	return !(await agentArtifactsPresent(machine, provider));
}

/**
 * After wake, restart gateway or finalize URL when the agent is installed.
 * Returns whether full bootstrap is required (artifacts missing).
 */
export async function repairGatewayAfterWake(
	machine: MachineRef,
	provider: MachineProvider,
	config: import("@/lib/user-config/schema").UserConfig,
): Promise<{ repaired: boolean; missingArtifacts: boolean; apiUrl?: string | null }> {
	if (machine.agentKind === "claude-code" || machine.agentKind === "codex") {
		const present = await agentArtifactsPresent(machine, provider);
		return { repaired: false, missingArtifacts: !present, apiUrl: null };
	}

	const present = await agentArtifactsPresent(machine, provider);
	if (!present) {
		return { repaired: false, missingArtifacts: true, apiUrl: null };
	}

	const result = await finalizeGatewayBootstrap({
		machine,
		provider,
		config,
		onState: async () => {},
	});
	return { repaired: true, missingArtifacts: false, apiUrl: result.apiUrl };
}
