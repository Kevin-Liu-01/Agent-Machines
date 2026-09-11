import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { DashboardConfigProvider } from "@/components/dashboard/DashboardConfigProvider";
import { OverviewClient } from "@/components/dashboard/OverviewClient";
import { gettingStartedSteps, OverviewGettingStarted } from "@/components/dashboard/OverviewGettingStarted";
import { filterFleet } from "@/lib/dashboard/fleet-presentation";
import { DEFAULT_USER_CONFIG, DEFAULT_MACHINE_SPEC, INITIAL_BOOTSTRAP_STATE, toPublicConfig, type PublicMachineRef } from "@/lib/user-config/schema";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());
const config = () => toPublicConfig(structuredClone(DEFAULT_USER_CONFIG));
const machine = (patch: Partial<PublicMachineRef> = {}): PublicMachineRef => ({
	id: "owned machine", name: "Code review", agentKind: "codex", providerKind: "daytona",
	spec: structuredClone(DEFAULT_MACHINE_SPEC), model: "gpt-5.4", createdAt: "2026-09-10T00:00:00Z",
	agentProfileId: null, gatewayProfileId: null, environmentProfileId: null, bootstrapPresetId: null,
	apiUrl: null, hasApiKey: false, bootstrapState: { ...INITIAL_BOOTSTRAP_STATE }, ...patch,
});

describe("configuration-backed workspace onboarding", () => {
	it("does not infer completed steps from setupStep or a selected provider", () => {
		const value = config();
		value.setupStep = "provisioned";
		value.draftProviderKind = "daytona";
		value.draftAgentKind = "codex";
		expect(gettingStartedSteps(value).map((step) => step.complete)).toEqual([false, false, false, false]);
	});

	it("requires native credentials for the selected native runtime", () => {
		const value = config();
		value.draftAgentKind = "codex";
		value.providers.daytona.configured = true;
		value.aiProviders.openrouter.configured = true;
		expect(gettingStartedSteps(value).map((step) => step.complete)).toEqual([true, false, false, false]);
		value.aiProviders.openai.configured = true;
		expect(gettingStartedSteps(value)[1].complete).toBe(true);
	});

	it("excludes archived machines and retired provider credentials", () => {
		const value = config();
		value.providers.dedalus.configured = true;
		value.machines = [machine({ archived: true, bootstrapState: { ...INITIAL_BOOTSTRAP_STATE, phase: "succeeded" } })];
		value.activeMachineId = value.machines[0].id;
		expect(gettingStartedSteps(value).map((step) => step.complete)).toEqual([false, false, false, false]);
	});

	it.each(["idle", "running", "failed", "succeeded"] as const)("uses recorded bootstrap phase %s, not machine existence, for installation progress", (phase) => {
		const value = config();
		value.machines = [machine({ bootstrapState: { ...INITIAL_BOOTSTRAP_STATE, phase } })];
		value.activeMachineId = value.machines[0].id;
		const steps = gettingStartedSteps(value);
		expect(steps[2].complete).toBe(true);
		expect(steps[3].complete).toBe(phase === "succeeded");
		expect(steps[3].href).toBe("/dashboard/machines/owned%20machine");
	});

	it("makes saved-configuration evidence explicit and uses working setup destinations", () => {
		const html = renderToStaticMarkup(React.createElement(DashboardConfigProvider, { config: config(), children: React.createElement(OverviewGettingStarted) }));
		expect(html).toContain("Credentials are not connection-tested here");
		expect(html).toContain("0 of 4 complete");
		expect(html).toContain('href="/dashboard/settings"');
		expect(html).toContain('href="#launch-worker"');
	});

	it("renders scoped workspace actions without reporting cached records as live-running", () => {
		const value = config();
		value.machines = [machine()];
		value.activeMachineId = value.machines[0].id;
		const html = renderToStaticMarkup(React.createElement(DashboardConfigProvider, { config: value, children: React.createElement(OverviewClient, { savedSetupCount: 3 }) }));
		for (const path of ["terminal", "console", "artifacts", "logs"]) expect(html).toContain(`href="/dashboard/machines/owned%20machine/${path}"`);
		expect(html).toContain("Checking status…");
		expect(html).toContain("Selected workspace");
		expect(html).toContain("Recent activity");
		expect(html).toContain("Workspace lifecycle events");
		expect(html).toContain("Loading recorded activity…");
		expect(html).toContain('role="status" aria-live="polite"');
		expect(html).not.toContain("gateway online");
		const source = readFileSync(resolve(process.cwd(), "components/dashboard/OverviewClient.tsx"), "utf8");
		expect(source).toContain('fetch("/api/dashboard/machines"');
		expect(source).not.toContain('/api/dashboard/gateway');
		expect(source).not.toContain('method: "POST"');
	});
});

describe("fleet search and filters", () => {
	const machines = [
		{ ...machine(), live: { ok: true as const, state: "ready" } },
		{ ...machine({ id: "research", name: "Research", agentKind: "hermes", providerKind: "e2b", model: "claude-opus" }), live: { ok: true as const, state: "sleeping" } },
		{ ...machine({ id: "offline", name: "Offline" }), live: { ok: false as const, reason: "provider unavailable" } },
		{ ...machine({ id: "installing", name: "Installing" }), live: { ok: true as const, state: "starting" } },
	];
	it.each([["  CODE REVIEW  ", "owned machine"], ["E2B", "research"], ["Hermes", "research"], ["claude-opus", "research"]])("matches query %s by name, runtime, provider, or model", (query, id) => {
		expect(filterFleet(machines, query, "all").map((row) => row.id)).toEqual([id]);
	});
	it("combines status and text filters without mutating the source", () => {
		expect(filterFleet(machines, "", "ready").map((row) => row.id)).toEqual(["owned machine"]);
		expect(filterFleet(machines, "", "sleeping").map((row) => row.id)).toEqual(["research"]);
		expect(filterFleet(machines, "", "attention").map((row) => row.id)).toEqual(["offline", "installing"]);
		expect(filterFleet(machines, "E2B", "ready")).toEqual([]);
		expect(machines).toHaveLength(4);
	});
});
