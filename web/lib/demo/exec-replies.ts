/**
 * Demo terminal exec — scripted stdout for dashboard TerminalPanel chips.
 */

import type { MachineRef } from "@/lib/user-config/schema";

import type { MachineNarrative } from "./config";
import { getMachineNarrative } from "./config";
import { resolveDemoMachineId } from "./machine-narratives";
import { allDemoMachines } from "./state";

export type DemoExecResult = {
	stdout: string;
	stderr: string;
	exitCode: number;
};

function ctx(machineId?: string | null): {
	id: string;
	machine: MachineRef | undefined;
	narrative: MachineNarrative;
} {
	const id = resolveDemoMachineId(machineId);
	const machine = allDemoMachines().find((m) => m.id === id);
	return { id, machine, narrative: getMachineNarrative(id, machine) };
}

function hostName(machine: MachineRef | undefined, id: string): string {
	return machine?.name ?? id.replace("demo-", "");
}

function agentLabel(machine: MachineRef | undefined): string {
	switch (machine?.agentKind) {
		case "claude-code":
			return "claude-code";
		case "openclaw":
			return "openclaw";
		case "codex":
			return "codex";
		default:
			return "hermes";
	}
}

function formatStartup(
	machine: MachineRef | undefined,
	id: string,
	narrative: MachineNarrative,
): string {
	const host = hostName(machine, id);
	const runtime = agentLabel(machine);
	const runtimeVersion =
		runtime === "hermes"
			? "hermes 0.4.2"
			: runtime === "claude-code"
				? "claude-code 1.2.0"
				: runtime === "openclaw"
					? "openclaw 2026.5.1"
					: "codex 0.9.1";

	return (
		"--- MACHINE STATUS ---\n" +
		"machine\n" +
		`${host}\n` +
		"/home/machine\n" +
		"--- AGENT RUNTIME ---\n" +
		`${runtimeVersion}\n` +
		"--- LISTENING PORTS ---\n" +
		"LISTEN 0.0.0.0:8642  users:((gateway,pid=1842))\n" +
		"LISTEN 127.0.0.1:18789 users:((agent,pid=1901))\n" +
		"--- APP DATA ---\n" +
		"artifacts\nchats\ncrons\nlogs\nsessions\nsettings.json\nskills\n" +
		"--- UPTIME ---\n" +
		` 14:22:01 up 12 days,  3:14,  0 users,  load average: 0.08, 0.12, 0.09\n` +
		`# last run: ${narrative.headline}\n`
	);
}

function formatIdentity(machine: MachineRef | undefined, id: string): string {
	const host = hostName(machine, id);
	return (
		"machine\n" +
		`${host}\n` +
		"/home/machine\n" +
		"HOME=/home/machine\n"
	);
}

function formatPorts(): string {
	return (
		"LISTEN 0.0.0.0:8642  users:((gateway,pid=1842))\n" +
		"LISTEN 127.0.0.1:18789 users:((agent,pid=1901))\n" +
		"LISTEN 127.0.0.1:9119  users:((metrics,pid=1908))\n"
	);
}

function formatProcesses(): string {
	return (
		"USER       PID  %CPU %MEM    VSZ   RSS COMMAND\n" +
		"machine   1842   4.2  8.1 412800 166912 gateway\n" +
		"machine   1901   2.8  6.4 318400 131072 agent\n" +
		"machine   1920   0.4  1.2  88400  24576 cron-runner\n" +
		"machine   1933   0.2  0.8  44200  16384 sshd\n"
	);
}

function formatDisk(): string {
	return (
		"Filesystem      Size  Used Avail Use% Mounted on\n" +
		"/dev/vda1        10G  2.4G  7.2G  25% /home/machine\n" +
		"---\n" +
		"412M\t/home/machine/.agent-machines\n"
	);
}

function formatAppData(narrative: MachineNarrative): string {
	const artifactLines = narrative.artifacts.map(
		(a) => `/home/machine/.agent-machines/artifacts/${a.name}`,
	);
	const chatLines = narrative.chats.map(
		(c) => `/home/machine/.agent-machines/chats/${c.id}.json`,
	);
	const logFiles = narrative.logs.files.map((f) => f.path.replace("~", "/home/machine"));
	return [
		"/home/machine/.agent-machines/settings.json",
		...chatLines,
		...artifactLines,
		...logFiles,
		"/home/machine/.agent-machines/sessions/_index.json",
		"/home/machine/.agent-machines/skills/security-audit-repo/SKILL.md",
	].join("\n");
}

function formatSettings(machine: MachineRef | undefined): string {
	return JSON.stringify(
		{
			activeMachineId: machine?.id ?? "demo-fullstack",
			agentKind: machine?.agentKind ?? "hermes",
			model: machine?.model ?? "anthropic/claude-opus-4-7",
			gatewayUrl: "http://127.0.0.1:8642/v1",
			syncedAt: new Date().toISOString(),
		},
		null,
		2,
	);
}

function formatGitStatus(): string {
	return (
		" M web/lib/demo/demo-config.json\n" +
		" M web/lib/demo/exec-replies.ts\n" +
		"?? web/lib/demo/chat-replies.ts\n" +
		"a1b2c3d\n"
	);
}

function formatLiveMarker(narrative: MachineNarrative): string {
	return `live-fire ok — ${narrative.headline} — ${new Date().toISOString()}\n`;
}

function formatVersion(machine: MachineRef | undefined): string {
	switch (machine?.agentKind) {
		case "claude-code":
			return "claude-code 1.2.0 (anthropic)\n";
		case "openclaw":
			return "openclaw 2026.5.1\n";
		case "codex":
			return "codex 0.9.1\n";
		default:
			return "hermes 0.4.2\n";
	}
}

function formatSkills(): string {
	return [
		"security-audit-repo/SKILL.md",
		"deepsec/SKILL.md",
		"dedalus-machines/SKILL.md",
		"agent-ethos/SKILL.md",
		"plan-mode-review/SKILL.md",
		"gstack-qa/SKILL.md",
	].join("\n");
}

function formatCrons(): string {
	return [
		"hourly-health-check.json",
		"daily-wiki-digest.json",
		"weekly-skill-audit.json",
		"nightly-memory-consolidation.json",
	].join("\n");
}

function formatGatewayLog(narrative: MachineNarrative): string {
	return narrative.logs.lines
		.slice(-8)
		.map((l) => `[${l.at}] ${l.level} ${l.source}: ${l.message}`)
		.join("\n");
}

function formatModels(): string {
	return JSON.stringify(
		{
			object: "list",
			data: [
				{ id: "anthropic/claude-opus-4-7", object: "model" },
				{ id: "anthropic/claude-sonnet-4-6", object: "model" },
				{ id: "anthropic/claude-opus-4-6", object: "model" },
				{ id: "openai/gpt-4.1", object: "model" },
			],
		},
		null,
		2,
	);
}

function formatOpenClawState(): string {
	return [
		"/home/machine/.openclaw/AGENTS.md",
		"/home/machine/.openclaw/MEMORY.md",
		"/home/machine/.openclaw/skills/dedalus-machines/SKILL.md",
		"/home/machine/.openclaw/sessions/sess-cron-health.json",
	].join("\n");
}

function formatOpenClawLog(narrative: MachineNarrative): string {
	const cronLines = narrative.logs.lines.filter((l) => l.source === "cron" || l.source === "github");
	if (cronLines.length === 0) return formatGatewayLog(narrative);
	return cronLines.map((l) => `[${l.at}] ${l.message}`).join("\n");
}

function formatOpenClawConfig(): string {
	return (
		"gateway.port = 18789\n" +
		"gateway.host = 127.0.0.1\n" +
		"agent.model = anthropic/claude-sonnet-4-6\n" +
		"cron.enabled = true\n"
	);
}

function formatLs(narrative: MachineNarrative): string {
	if (narrative.artifacts.length === 0) {
		return "artifacts/\nlogs/\nsessions/\nskills/\n";
	}
	return `${narrative.artifacts.map((a) => a.name).join("\n")}\n`;
}


export function resolveDemoExec(
	command: string,
	machineId?: string | null,
): DemoExecResult {
	const { id, machine, narrative } = ctx(machineId);
	const lower = command.toLowerCase();

	if (lower.includes("--- machine status ---") || (lower.includes("uptime") && lower.includes("whoami"))) {
		return { stdout: formatStartup(machine, id, narrative), stderr: "", exitCode: 0 };
	}
	if (lower.includes("whoami") && lower.includes("hostname")) {
		return { stdout: formatIdentity(machine, id), stderr: "", exitCode: 0 };
	}
	if (lower.includes("ss -tlnp") || lower.includes("grep -e ':(8642")) {
		return { stdout: formatPorts(), stderr: "", exitCode: 0 };
	}
	if (lower.includes("ps aux")) {
		return { stdout: formatProcesses(), stderr: "", exitCode: 0 };
	}
	if (lower.includes("df -h") || lower.includes("du -sh /home/machine/.agent-machines")) {
		return { stdout: formatDisk(), stderr: "", exitCode: 0 };
	}
	if (lower.includes("find /home/machine/.agent-machines") && lower.includes("maxdepth 2")) {
		return { stdout: formatAppData(narrative), stderr: "", exitCode: 0 };
	}
	if (lower.includes("settings.json")) {
		return { stdout: formatSettings(machine), stderr: "", exitCode: 0 };
	}
	if (lower.includes("git status") || lower.includes("git rev-parse")) {
		return { stdout: formatGitStatus(), stderr: "", exitCode: 0 };
	}
	if (lower.includes("live-fire-agent")) {
		return { stdout: formatLiveMarker(narrative), stderr: "", exitCode: 0 };
	}
	if (lower.includes("hermes --version") || (lower.includes("--version") && !lower.includes("openclaw"))) {
		return { stdout: formatVersion(machine), stderr: "", exitCode: 0 };
	}
	if (lower.includes("/skills") && lower.includes("find")) {
		return { stdout: formatSkills(), stderr: "", exitCode: 0 };
	}
	if (lower.includes("/crons") && lower.includes("find")) {
		return { stdout: formatCrons(), stderr: "", exitCode: 0 };
	}
	if (lower.includes("gateway.log") || lower.includes("tail -n")) {
		if (lower.includes("openclaw")) {
			return { stdout: formatOpenClawLog(narrative), stderr: "", exitCode: 0 };
		}
		return { stdout: formatGatewayLog(narrative), stderr: "", exitCode: 0 };
	}
	if (lower.includes("/v1/models") || lower.includes("curl -s")) {
		return { stdout: formatModels(), stderr: "", exitCode: 0 };
	}
	if (lower.includes(".openclaw") && lower.includes("find")) {
		return { stdout: formatOpenClawState(), stderr: "", exitCode: 0 };
	}
	if (lower.includes("openclaw config")) {
		return { stdout: formatOpenClawConfig(), stderr: "", exitCode: 0 };
	}
	if (lower.trim() === "ls" || lower.startsWith("ls ") || lower.includes(" ls ")) {
		return { stdout: formatLs(narrative), stderr: "", exitCode: 0 };
	}
	if (lower.includes("deepsec")) {
		return { stdout: narrative.execStdout, stderr: "", exitCode: 0 };
	}
	if (lower.includes("curl") && lower.includes("health")) {
		return { stdout: "502\n", stderr: "", exitCode: 0 };
	}
	if (lower.includes("identity") && !lower.includes("find")) {
		return { stdout: formatIdentity(machine, id), stderr: "", exitCode: 0 };
	}

	return { stdout: narrative.execStdout || formatIdentity(machine, id), stderr: "", exitCode: 0 };
}

function sseFrame(event: string, data: unknown): string {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function sleepMs(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** SSE stream matching /api/dashboard/exec/stream shape. */
export function createDemoExecStream(
	command: string,
	machineId?: string | null,
): ReadableStream<Uint8Array> {
	const result = resolveDemoExec(command, machineId);
	const startedAt = new Date().toISOString();
	const t0 = Date.now();
	const delay = Math.min(350 + Math.floor(result.stdout.length / 30), 1400);

	return new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			const write = (s: string) => controller.enqueue(encoder.encode(s));

			write(sseFrame("started", { command, startedAt }));
			write(sseFrame("heartbeat", { elapsedMs: 120 }));
			await sleepMs(delay);
			write(
				sseFrame("done", {
					exitCode: result.exitCode,
					stdout: result.stdout,
					stderr: result.stderr,
					elapsedMs: Date.now() - t0,
					finishedAt: new Date().toISOString(),
				}),
			);
			controller.close();
		},
	});
}
