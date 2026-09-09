/**
 * Shared, bounded runtime readiness probes; no bootstrap or repair dependency.
 */

import type { MachineProvider } from "@/lib/providers";
import type { MachineRef } from "@/lib/user-config/schema";
import { getHarness } from "agent-machines/mux";

function homeFor(providerKind: MachineRef["providerKind"]): string {
	if (providerKind === "daytona") return "/home/daytona";
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
				`export HOME=${home}`,
				pathExports(home),
				getHarness("claude-code").isInstalledCommand(),
				`test -f ${appHome}/.agent-env`,
				"echo ok",
			].join(" && "),
			{ timeoutMs: 15_000 },
		);
		return probe.exitCode === 0 && probe.stdout.trim() === "ok";
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
		return probe.exitCode === 0 && probe.stdout.trim() === "ok";
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
		return probe.exitCode === 0 && probe.stdout.trim() === "ok";
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
