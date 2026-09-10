import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { SetupWizard } from "@/components/dashboard/SetupWizard";
import * as schema from "@/lib/user-config/schema";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const steps: schema.SetupStep[] = ["api-key", "agent", "provider", "spec", "review", "provisioned"];
function config() {
	return schema.toPublicConfig(structuredClone(schema.DEFAULT_USER_CONFIG));
}
function render(step: schema.SetupStep) {
	const initialConfig = config();
	initialConfig.setupStep = step;
	return renderToStaticMarkup(React.createElement(SetupWizard, {
		initialConfig,
		defaults: { machineSpec: initialConfig.draftSpec, model: initialConfig.draftModel, hasOwnerDaytonaKey: false, hasOwnerCursorKey: false, hasOwnerMachine: false },
	}));
}

type Element = { type: unknown; props: Record<string, any> };
function nodes(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(nodes);
	if (!value || typeof value !== "object" || !("props" in value)) return [];
	const element = value as Element;
	return [element, ...nodes(element.props.children)];
}
function text(value: unknown): string {
	if (Array.isArray(value)) return value.map(text).join("");
	return value && typeof value === "object" ? text((value as Element).props?.children) : typeof value === "string" ? value : "";
}

/** Execute the real presentation callbacks with inert icons and no network. */
function loadSteps(initialState?: unknown, wizardState?: unknown[]) {
	let state = initialState;
	let stateIndex = 0;
	const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
	const react = { useMemo: (callback: () => unknown) => callback(), useCallback: (callback: unknown) => callback, useState: (initial: unknown) => {
		if (wizardState) {
			const index = stateIndex++;
			if (!(index in wizardState)) wizardState[index] = initial;
			return [wizardState[index], (next: unknown) => { wizardState[index] = next; }];
		}
		if (state === undefined) state = initial;
		return [state, (next: unknown) => { state = typeof next === "function" ? next(state) : next; }];
	} };
	const source = readFileSync(resolve(process.cwd(), "components/dashboard/SetupWizard.tsx"), "utf8");
	const module = { exports: {} as Record<string, (props: Record<string, unknown>) => Element> };
	runInNewContext(ts.transpileModule(`${source}\nexport { CredentialsStep, AgentStep, ProviderStep, ReviewStep, ProvisionedStep, StepRail };`, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
	}).outputText, {
		module, exports: module.exports,
		require: (id: string) => id === "react/jsx-runtime" ? { jsx, jsxs: jsx }
			: id === "react" ? react
				: id.endsWith("user-config/schema") ? schema
					: id === "@/lib/cn" ? { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }
						: new Proxy({}, { get: () => () => null }),
	});
	return module.exports;
}

describe("dashboard setup presentation", () => {
	it.each(steps)("renders readable step %s with shared solid icons and immediate state changes", (step) => {
		const html = render(step);
		expect(html).toContain('aria-label="Worker setup progress"');
		expect(html).toContain('aria-current="step"');
		expect(html).toContain('data-icon-family="phosphor"');
		expect(html).toContain('data-icon-weight="fill"');
		expect(html).toContain("text-xl font-semibold");
		expect(html).toContain("text-base leading-7");
		expect(html).not.toMatch(/text-\[(?:9|10|11|12)px\]|transition-all|animate-|tracking-\[0\.18em\]|uppercase/);
	});

	it("retains all13 blank credential fields, including nine masked secrets", () => {
		const html = render("api-key");
		const inputs = [...html.matchAll(/<input\b[^>]*>/g)].map(([input]) => input);
		expect(inputs).toHaveLength(13);
		expect(inputs.filter((input) => input.includes('type="password"'))).toHaveLength(9);
		expect(inputs.filter((input) => input.includes('type="text"'))).toHaveLength(4);
		for (const input of inputs) {
			expect(input).toContain('value=""');
			expect(input).toContain('autoComplete="off"');
			expect(input).toContain('autoCapitalize="none"');
			expect(input).toContain('autoCorrect="off"');
			expect(input).toContain('spellCheck="false"');
			expect(input).toContain("min-h-11");
			expect(input).toContain("text-base");
			expect(input).toContain("focus:outline-2");
		}
	});

	it("keeps resource limits and the model field while labeling allocation as requested", () => {
		const html = render("spec");
		expect(html).toContain("These are requested resources.");
		const inputs = [...html.matchAll(/<input\b[^>]*>/g)].map(([input]) => input);
		expect(inputs).toHaveLength(4);
		expect(inputs[0]).toContain('min="1" max="16" step="1"');
		expect(inputs[1]).toContain('min="512" max="65536" step="512"');
		expect(inputs[2]).toContain('min="5" max="200" step="1"');
		expect(inputs[3]).toContain('type="text"');
	});

	it("uses native progress buttons but never makes a future step reachable", () => {
		const jump = vi.fn();
		const tree = loadSteps().StepRail({ active: "provider", completed: new Set(["api-key", "agent"]), onJump: jump });
		const buttons = nodes(tree).filter((node) => node.type === "button");
		expect(buttons).toHaveLength(6);
		expect(buttons.map((button) => button.props.disabled)).toEqual([false, false, false, true, true, true]);
		expect(buttons[2].props["aria-current"]).toBe("step");
		buttons[0].props.onClick();
		buttons[4].props.onClick();
		expect(jump.mock.calls).toEqual([["api-key"]]);
		for (const button of buttons) expect(button.props.className).toContain("focus-visible:outline-2");
	});

	it.each(["AgentStep", "ProviderStep"])("exposes selection and disabled state in %s without changing selection callbacks", async (name) => {
		const onSelect = vi.fn();
		const tree = loadSteps()[name]({ value: name === "AgentStep" ? "codex" : "daytona", configured: config().providers, busy: true, onSelect });
		const buttons = nodes(tree).filter((node) => node.type === "button");
		expect(buttons).toHaveLength(4);
		expect(buttons.filter((button) => button.props["aria-pressed"])).toHaveLength(1);
		for (const button of buttons) {
			expect(button.props.disabled).toBe(true);
			expect(button.props.className).toContain("disabled:cursor-not-allowed");
			expect(button.props.className).toContain("focus-visible:outline-2");
		}
		const available = loadSteps()[name]({ value: name === "AgentStep" ? "codex" : "daytona", configured: config().providers, busy: false, onSelect });
		nodes(available).find((node) => node.type === "button")!.props.onClick();
		expect(onSelect).toHaveBeenCalledTimes(1);
	});

	it("preserves blank-key retention and exact credential payloads", async () => {
		const components = loadSteps(), onSave = vi.fn();
		const props = { config: config(), hasOwnerDaytonaKey: false, busy: false, onSave };
		const draw = () => components.CredentialsStep(props);
		let tree = draw();
		const save = () => nodes(tree).find((node) => text(node).trim() === "Save and continue" && node.props.onClick)!.props.onClick();
		await save();
		expect(onSave.mock.calls[0]).toEqual([{}, undefined, undefined]);
		const replacements: Record<string, string> = {
			"Daytona API key": "  fixture-daytona  ", "Daytona API URL (optional)": " https://app.daytona.io/api ", "Daytona target (optional)": " us ",
			"Vercel access token": " fixture-vercel ", "Vercel team ID": " team_fixture ", "Vercel project ID": " prj_fixture ",
			"Cursor API key (optional)": " fixture-cursor ", "Anthropic API key": " fixture-anthropic ",
		};
		for (const [label, value] of Object.entries(replacements)) {
			nodes(tree).find((node) => node.props.label === label)!.props.onChange(value);
			tree = draw();
		}
		await save();
		expect(onSave.mock.calls[1]).toEqual([{
			daytona: { apiKey: "fixture-daytona", apiUrl: "https://app.daytona.io/api", target: "us" },
			vercel: { token: "fixture-vercel", teamId: "team_fixture", projectId: "prj_fixture" },
		}, "fixture-cursor", { anthropic: "fixture-anthropic" }]);
	});

	it("preserves the provision guard and keeps provider costs visible before launch", () => {
		const current = config(), onProvision = vi.fn(), onBack = vi.fn();
		current.draftProviderKind = "daytona";
		current.providers.daytona.configured = false;
		const draw = (busy: boolean) => loadSteps().ReviewStep({ config: current, busy, onProvision, onBack });
		const launch = (tree: Element) => nodes(tree).find((node) => node.props.variant === "primary")!;
		expect(launch(draw(false)).props.disabled).toBe(true);
		current.providers.daytona.configured = true;
		expect(launch(draw(true)).props.disabled).toBe(true);
		expect(launch(draw(false)).props.disabled).toBe(false);
		launch(draw(false)).props.onClick();
		expect(onProvision).toHaveBeenCalledTimes(1);
		expect(render("review")).toContain("Provider charges may apply.");
	});

	it.each(["missing", "dangling", "archived"])("does not claim a Worker is ready when the active machine is %s", (kind) => {
		const current = config();
		current.setupStep = "provisioned";
		current.draftAgentKind = "claude-code";
		current.draftProviderKind = "dedalus";
		if (kind !== "missing") current.activeMachineId = "missing-machine";
		if (kind === "archived") current.machines = [machine({ id: "missing-machine", archived: true })];
		const onConfigure = vi.fn(), onChat = vi.fn(), onMachines = vi.fn();
		const tree = loadSteps().ProvisionedStep({ config: current, onConfigure, onChat, onMachines });
		expect(tree.props.title).toBe("No active Worker");
		expect(tree.props.description).toContain("saved setup");
		expect(JSON.stringify(tree)).not.toMatch(/Your Worker is ready|launch operation completed|dedalus|"--"/);
		expect(nodes(tree).find((node) => node.props.label === "Saved agent")?.props.value).toBe("Claude Code");
		expect(nodes(tree).find((node) => node.props.label === "Saved provider")?.props.value).toBe("Retired provider");
		expect(nodes(tree).some((node) => node.props.onClick === onChat)).toBe(false);
		nodes(tree).find((node) => node.props.onClick === onConfigure)!.props.onClick();
		nodes(tree).find((node) => node.props.onClick === onMachines)!.props.onClick();
		expect(onConfigure).toHaveBeenCalledOnce();
		expect(onMachines).toHaveBeenCalledOnce();
		expect(onChat).not.toHaveBeenCalled();
	});

	it("returns to agent selection locally without resetting or saving the stale config", () => {
		const current = config();
		current.setupStep = "provisioned";
		current.draftProviderKind = "dedalus";
		const snapshot = structuredClone(current), state: unknown[] = [];
		const components = loadSteps(undefined, state);
		const tree = components.SetupWizard({ initialConfig: current, defaults: {} });
		const ready = nodes(tree).find((node) => node.type === components.ProvisionedStep)!;
		ready.props.onConfigure();
		expect(state[1]).toBe("agent");
		expect(state[0]).toBe(current);
		expect(current).toEqual(snapshot);
	});

	it("keeps real provisioned machine actions and uses readable agent/provider names", () => {
		const current = config(), onChat = vi.fn(), onMachines = vi.fn();
		current.machines = [machine()];
		current.activeMachineId = current.machines[0].id;
		const tree = loadSteps().ProvisionedStep({ config: current, onConfigure: vi.fn(), onChat, onMachines });
		expect(tree.props.title).toBe("Your Worker is ready");
		expect(nodes(tree).find((node) => node.props.label === "Active machine ID")?.props.value).toBe("ready-machine");
		expect(nodes(tree).find((node) => node.props.label === "Agent")?.props.value).toBe("Claude Code");
		expect(nodes(tree).find((node) => node.props.label === "Provider")?.props.value).toBe("Daytona");
		nodes(tree).find((node) => node.props.onClick === onChat)!.props.onClick();
		nodes(tree).find((node) => node.props.onClick === onMachines)!.props.onClick();
		expect(onChat).toHaveBeenCalledOnce();
		expect(onMachines).toHaveBeenCalledOnce();
	});
});

function machine(patch: Partial<schema.PublicMachineRef> = {}): schema.PublicMachineRef {
	return {
		id: "ready-machine", name: "Fixture Worker", providerKind: "daytona", agentKind: "claude-code",
		spec: structuredClone(schema.DEFAULT_MACHINE_SPEC), model: "claude-sonnet-4-6",
		agentProfileId: null, gatewayProfileId: null, environmentProfileId: null, bootstrapPresetId: null,
		createdAt: "2026-09-09T00:00:00Z", apiUrl: null, hasApiKey: false,
		bootstrapState: { ...schema.INITIAL_BOOTSTRAP_STATE, phase: "succeeded" }, ...patch,
	};
}
