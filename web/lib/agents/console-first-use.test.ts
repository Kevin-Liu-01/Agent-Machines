import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CONSOLE_STARTERS } from "./console-starters";
import { runtimeUsesGateway } from "./runtime-capabilities";
import { consoleResultEvents } from "./console-events";
import { onboardingWorkspaceUrl } from "../onboarding/launch";

describe("first useful Worker experience", () => {
	it.each(["claude-code", "codex", undefined])("does not poll a nonexistent gateway for %s", (agent) => {
		expect(runtimeUsesGateway(agent)).toBe(false);
	});
	it.each(["hermes", "openclaw"])("retains health checks for %s gateways", (agent) => {
		expect(runtimeUsesGateway(agent)).toBe(true);
	});
	it("opens the bounded Console after onboarding", () => {
		expect(onboardingWorkspaceUrl("machine/one")).toBe("/dashboard/machines/machine%2Fone/console?launch=1");
		const source = readFileSync(resolve(process.cwd(), "components/dashboard/OnboardingFlow.tsx"), "utf8");
		expect(source).toContain("onboardingWorkspaceUrl(bootMachineId)");
	});
	it("offers concrete tasks without assuming Cursor or a provider-specific home", () => {
		expect(CONSOLE_STARTERS).toHaveLength(4);
		const prompts = CONSOLE_STARTERS.map((s) => s.prompt).join("\n");
		expect(prompts).not.toMatch(/cursor_agent|\/home\/machine/);
		expect(prompts).toContain("~/.agent-machines/artifacts/workspace-summary.md");
	});
	it("keeps capture warnings visible alongside a successful task answer", () => {
		const events = consoleResultEvents({ text: "Task completed", events: [], exitCode: 0, warnings: ["One output exceeded the size limit."] });
		expect(events.some((event) => event.event === "status" && event.data.includes("size limit"))).toBe(true);
		expect(events.some((event) => event.event === "message" && event.data.includes("Task completed"))).toBe(true);
		expect(events.some((event) => event.event === "error")).toBe(false);
	});
	it("uses the selected Worker's abilities instead of a fabricated installed-tool list", () => {
		const console = readFileSync(resolve(process.cwd(), "components/agent-console/AgentConsole.tsx"), "utf8");
		const page = readFileSync(resolve(process.cwd(), "app/dashboard/machines/[machineId]/console/page.tsx"), "utf8");
		expect(console).not.toContain("DEFAULT_LOADOUT");
		expect(page).toContain("resolveMachineWorker(config, machine)");
		expect(page).toContain("loadoutItems={loadoutItems}");
	});
});
