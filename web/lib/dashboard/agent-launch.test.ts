import { describe, expect, it } from "vitest";

import { agentLaunchCommand, agentLabel, isCliAgent } from "./agent-launch";

describe("agentLaunchCommand", () => {
	it("cds into the repo, sources .agent-env, then launches the CLI", () => {
		expect(agentLaunchCommand("codex")).toContain("source ~/.agent-machines/.agent-env");
		expect(agentLaunchCommand("codex")?.endsWith(" codex")).toBe(true);
		expect(agentLaunchCommand("claude-code")?.endsWith(" claude")).toBe(true);
	});

	it("returns null for gateway agents and unknowns", () => {
		expect(agentLaunchCommand("hermes")).toBeNull();
		expect(agentLaunchCommand("openclaw")).toBeNull();
		expect(agentLaunchCommand(null)).toBeNull();
		expect(agentLaunchCommand(undefined)).toBeNull();
	});
});

describe("isCliAgent", () => {
	it("is true only for codex and claude-code", () => {
		expect(isCliAgent("codex")).toBe(true);
		expect(isCliAgent("claude-code")).toBe(true);
		expect(isCliAgent("hermes")).toBe(false);
		expect(isCliAgent("openclaw")).toBe(false);
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
