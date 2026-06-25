import { describe, expect, it } from "vitest";

import {
	agentLaunchCommand,
	agentLabel,
	agentTerminalLauncherCommand,
	isCliAgent,
} from "./agent-launch";

describe("agentLaunchCommand", () => {
	it("cds into the repo, sources .agent-env, then launches the coding CLI", () => {
		expect(agentLaunchCommand("codex")).toContain("source ~/.agent-machines/.agent-env");
		expect(agentLaunchCommand("codex")?.endsWith(" codex")).toBe(true);
		expect(agentLaunchCommand("claude-code")?.endsWith(" claude")).toBe(true);
	});

	it("launches the interactive chat REPL for gateway agents (venv/npm bin on PATH)", () => {
		const hermes = agentLaunchCommand("hermes");
		expect(hermes).toContain("venv/bin");
		expect(hermes?.endsWith(" hermes chat")).toBe(true);
		const openclaw = agentLaunchCommand("openclaw");
		expect(openclaw).toContain(".npm-global/bin");
		expect(openclaw?.endsWith(" openclaw chat")).toBe(true);
	});

	it("returns null for unknown agents", () => {
		expect(agentLaunchCommand(null)).toBeNull();
		expect(agentLaunchCommand(undefined)).toBeNull();
		expect(agentLaunchCommand("mystery")).toBeNull();
	});
});

describe("agentTerminalLauncherCommand", () => {
	it("uses the on-machine stateful launcher for interactive consoles", () => {
		expect(agentTerminalLauncherCommand("hermes")).toBe(
			"~/.agent-machines/bin/am-launch-agent hermes",
		);
		expect(agentTerminalLauncherCommand("openclaw")).toBe(
			"~/.agent-machines/bin/am-launch-agent openclaw",
		);
		expect(agentTerminalLauncherCommand("claude-code")).toBe(
			"~/.agent-machines/bin/am-launch-agent claude-code",
		);
		expect(agentTerminalLauncherCommand("codex")).toBe(
			"~/.agent-machines/bin/am-launch-agent codex",
		);
		expect(agentTerminalLauncherCommand("mystery")).toBeNull();
	});
});

describe("isCliAgent", () => {
	it("is true for all four agents (each has an interactive terminal)", () => {
		expect(isCliAgent("codex")).toBe(true);
		expect(isCliAgent("claude-code")).toBe(true);
		expect(isCliAgent("hermes")).toBe(true);
		expect(isCliAgent("openclaw")).toBe(true);
		expect(isCliAgent("mystery")).toBe(false);
	});
});

describe("agentLabel", () => {
	it("maps known agents and falls back to 'agent'", () => {
		expect(agentLabel("codex")).toBe("Codex");
		expect(agentLabel("claude-code")).toBe("Claude Code");
		expect(agentLabel("openclaw")).toBe("OpenClaw");
		expect(agentLabel("hermes")).toBe("Hermes");
		expect(agentLabel("mystery")).toBe("agent");
	});
});
