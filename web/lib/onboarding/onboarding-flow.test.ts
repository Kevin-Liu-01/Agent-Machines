import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

import * as credentials from "@/lib/agents/credentials";
import * as upstreams from "@/lib/agents/upstreams";
import * as schema from "@/lib/user-config/schema";
import { onboardingProviderReady } from "./launch";
import { selectedPreset } from "./preset-selection";

type Element = { type: any; props: Record<string, any> };
function nodes(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(nodes);
	if (!value || typeof value !== "object" || !("props" in value)) return [];
	const element = value as Element;
	return [element, ...nodes(element.props.children)];
}
function text(value: unknown): string {
	if (Array.isArray(value)) return value.map(text).join(" ");
	if (typeof value === "string" || typeof value === "number") return String(value);
	return value && typeof value === "object" ? text((value as Element).props?.children) : "";
}

const preset = { id: "test-preset", name: "Test specialist", description: "Existing instructions", skillIds: ["git"], mcpServerIds: ["github"] };
function fixture() {
	let cursor = 0;
	const cells: Array<{ value: any }> = [];
	let effects: Array<() => void> = [];
	const heading = { focus: vi.fn(), scrollIntoView: vi.fn() };
	const requests = vi.fn(() => { throw new Error("No provider request is allowed in presentation tests"); });
	const react = {
		useState(initial: unknown) {
			const index = cursor++;
			const cell = cells[index] ?? (cells[index] = { value: initial });
			return [cell.value, (value: any) => { cell.value = typeof value === "function" ? value(cell.value) : value; }];
		},
		useRef(initial: unknown) { return (cells[cursor] ?? (cells[cursor] = { value: { current: initial } }), cells[cursor++].value); },
		useMemo: (factory: () => unknown) => factory(),
		useCallback: (callback: unknown) => callback,
		useEffect(effect: () => void) { effects.push(effect); },
	};
	const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
	const module = { exports: {} as Record<string, (props: Record<string, any>) => Element> };
	const source = readFileSync(resolve(process.cwd(), "components/dashboard/OnboardingFlow.tsx"), "utf8");
	runInNewContext(ts.transpileModule(`${source}\nexport { AgentStep, PresetStep, ProviderPickStep, ProviderComparison, StepRail, KeyStep, BootStep };`, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
	}).outputText, {
		module, exports: module.exports, fetch: requests,
		require: (id: string) => id === "react" ? react
			: id === "react/jsx-runtime" ? { jsx, jsxs: jsx }
				: id === "next/navigation" ? { useRouter: () => ({ replace: vi.fn() }) }
					: id.endsWith("user-config/schema") ? schema
						: id.endsWith("agents/credentials") ? credentials
							: id.endsWith("agents/upstreams") ? upstreams
								: id.endsWith("onboarding/preset-selection") ? { selectedPreset }
									: id.endsWith("onboarding/launch") ? { onboardingProviderReady, submitOnboardingLaunch: requests }
										: id.endsWith("/cn") ? { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }
											: new Proxy({}, { get: (_target, key) => key === "ReticleButton" ? "button" : () => null }),
	});
	const wizard = module.exports;
	return {
		wizard, requests, heading,
		render(config = schema.toPublicConfig(structuredClone(schema.DEFAULT_USER_CONFIG))) {
			cursor = 0;
			effects = [];
			const tree = wizard.OnboardingFlow({ initialConfig: config, presets: [preset] });
			for (const element of nodes(tree)) {
				if (element.props.ref && typeof element.props.ref === "object") element.props.ref.current = { querySelector: () => heading };
			}
			for (const effect of effects) effect();
			return tree;
		},
	};
}

describe("onboarding presentation contracts (actual TSX)", () => {
	it("invariant_step_changes_focus_the_heading_without_animated_scroll_or_initial_focus_theft", () => {
		const { render, heading } = fixture();
		let tree = render();
		expect(heading.focus).not.toHaveBeenCalled();
		expect(heading.scrollIntoView).not.toHaveBeenCalled();
		for (const component of ["AgentStep", "PresetStep", "ProviderPickStep"]) {
			nodes(tree).find((node) => node.type?.name === component)!.props.onNext();
			tree = render();
		}
		expect(heading.focus).toHaveBeenCalledTimes(3);
		expect(heading.focus).toHaveBeenLastCalledWith({ preventScroll: true });
		expect(heading.scrollIntoView).toHaveBeenLastCalledWith({ behavior: "instant", block: "start" });
		render();
		expect(heading.focus).toHaveBeenCalledTimes(3);
		nodes(tree).find((node) => node.type?.name === "KeyStep")!.props.onBack();
		render();
		expect(heading.focus).toHaveBeenCalledTimes(4);
	});

	it("invariant_unselected_presets_do_not_claim_to_be_selected", () => {
		const { wizard } = fixture();
		const tree = wizard.PresetStep({ presets: [preset], selectedId: "__none__", onPick() {}, onNext() {}, onBack() {} });
		const card = nodes(tree).find((node) => node.type === "button" && node.props["aria-pressed"] === false)!;
		const copy = text(card).replace(/\s+/g, " ");
		expect(copy).not.toContain("Selected");
		expect(copy).toContain("Skills: 1");
		expect(copy).toContain("MCP servers: 1");
	});

	it.each(["dedalus", "unknown-provider"])("invariant_unsupported_draft_%s_does_not_become_a_launch_choice", (provider) => {
		const { render, requests } = fixture();
		const config = { ...schema.toPublicConfig(schema.DEFAULT_USER_CONFIG), draftProviderKind: provider as schema.ProviderKind };
		const before = structuredClone(config);
		const tree = render(config);
		const preview = nodes(tree).find((node) => node.type?.name === "RigPreview")!;
		expect(preview.props.provider).toBe("daytona");
		expect(config).toEqual(before);
		expect(requests).not.toHaveBeenCalled();
	});

	it.each([
		["AgentStep", { value: "hermes" }, 4],
		["PresetStep", { presets: [preset], selectedId: preset.id }, 2],
		["ProviderPickStep", { value: "daytona", configured: schema.toPublicConfig(schema.DEFAULT_USER_CONFIG).providers }, 4],
	] as const)("invariant_%s_exposes_selection_without_triggering_launch", (component, props, count) => {
		const { wizard, requests } = fixture();
		const onPick = vi.fn();
		const tree = wizard[component]({ ...props, onPick, onNext() {}, onBack() {} });
		const choices = nodes(tree).filter((node) => node.type === "button" && "aria-pressed" in node.props);
		expect(choices).toHaveLength(count);
		expect(choices.filter((node) => node.props["aria-pressed"])).toHaveLength(1);
		expect(nodes(tree).find((node) => node.type === "h1")!.props.tabIndex).toBe(-1);
		for (const choice of choices) {
			expect(choice.props.type).toBe("button");
			choice.props.onClick();
		}
		expect(onPick).toHaveBeenCalledTimes(count);
		expect(requests).not.toHaveBeenCalled();
	});

	it("invariant_progress_identifies_the_current_step_without_fake_navigation", () => {
		const { wizard } = fixture();
		for (const step of ["agent", "preset", "provider", "key", "boot"]) {
			const tree = wizard.StepRail({ step });
			expect(nodes(tree).filter((node) => node.props["aria-current"] === "step")).toHaveLength(1);
			expect(nodes(tree).filter((node) => node.type === "button")).toHaveLength(0);
		}
	});

	it("invariant_provider_comparison_is_optional_but_preserves_the_complete_matrix", () => {
		const { wizard } = fixture();
		const tree = wizard.ProviderComparison({ selected: "e2b" });
		const disclosure = nodes(tree).find((node) => node.type === "details");
		expect(disclosure).toBeDefined();
		expect(disclosure!.props.open).not.toBe(true);
		expect(nodes(disclosure).find((node) => node.type === "summary")).toBeDefined();
		expect(nodes(disclosure).filter((node) => node.type === "tr")).toHaveLength(10);
		expect(text(disclosure)).toContain("Filesystem and memory");
		expect(text(disclosure)).toContain("Filesystem only");
	});

	it("invariant_credentials_keep_password_controls_callbacks_and_launch_gates", () => {
		const { wizard } = fixture();
		const onChange = vi.fn(), onAiKeyChange = vi.fn(), onSecondaryChange = vi.fn(), onProvision = vi.fn();
		const props = {
			agent: "codex", provider: "vercel", config: schema.toPublicConfig(schema.DEFAULT_USER_CONFIG),
			readiness: upstreams.agentUpstreamReadiness("codex", "", {}), substrateReady: false,
			hasKey: true, value: "", aiKeys: { vercelAiGateway: "", openrouter: "", anthropic: "", openai: "" },
			agentCredsOk: false, secondary: {}, busy: false, canProvision: false,
			onChange, onAiKeyChange, onSecondaryChange, onProvision, onBack() {},
		};
		const tree = wizard.KeyStep(props);
		const passwordInputs = nodes(tree).filter((node) => node.type === "input" && node.props.type === "password");
		expect(passwordInputs).toHaveLength(2);
		for (const input of passwordInputs) expect(input.props).toMatchObject({ autoComplete: "off", autoCapitalize: "none", autoCorrect: "off", spellCheck: false });
		passwordInputs[0].props.onChange({ target: { value: "test-provider-value" } });
		passwordInputs[1].props.onChange({ target: { value: "test-ai-value" } });
		expect(onChange).toHaveBeenCalledWith("test-provider-value");
		expect(onAiKeyChange).toHaveBeenCalledWith("openai", "test-ai-value");
		expect(text(tree)).toContain("Leave blank to keep the existing key");
		expect(text(tree)).toContain("providers bill you directly");
		const launch = (value: Element) => nodes(value).find((node) => node.props.onClick === onProvision)!;
		expect(launch(tree).props.disabled).toBe(true);
		expect(launch(wizard.KeyStep({ ...props, canProvision: true })).props.disabled).toBe(false);
		expect(launch(wizard.KeyStep({ ...props, canProvision: true, busy: true })).props.disabled).toBe(true);
		expect(onProvision).not.toHaveBeenCalled();
	});

	it("invariant_navigation_uses_real_readiness_without_saving_draft_credentials", () => {
		const { render, requests } = fixture();
		let tree = render();
		for (const component of ["AgentStep", "PresetStep", "ProviderPickStep"]) {
			nodes(tree).find((node) => node.type?.name === component)!.props.onNext();
			tree = render();
		}
		let keyStep = nodes(tree).find((node) => node.type?.name === "KeyStep")!;
		expect(keyStep.props.canProvision).toBe(false);
		keyStep.props.onChange("test-cloud-value");
		keyStep.props.onAiKeyChange("openai", "test-ai-value");
		tree = render();
		keyStep = nodes(tree).find((node) => node.type?.name === "KeyStep")!;
		expect(keyStep.props.canProvision).toBe(true);
		keyStep.props.onBack();
		tree = render();
		nodes(tree).find((node) => node.type?.name === "ProviderPickStep")!.props.onPick("vercel");
		tree = render();
		nodes(tree).find((node) => node.type?.name === "ProviderPickStep")!.props.onNext();
		tree = render();
		keyStep = nodes(tree).find((node) => node.type?.name === "KeyStep")!;
		expect(keyStep.props.value).toBe("");
		expect(keyStep.props.secondary).toEqual({});
		expect(keyStep.props.canProvision).toBe(false);
		expect(requests).not.toHaveBeenCalled();
	});

	it("invariant_failed_launch_keeps_retry_and_edit_callbacks_without_claiming_ready", () => {
		const { wizard } = fixture();
		const onRetry = vi.fn(), onBack = vi.fn();
		const tree = wizard.BootStep({ agent: "codex", provider: "e2b", machineId: null, phase: "failed", done: false, busy: false, error: "Test observation failed", onRetry, onBack });
		expect(text(tree)).toContain("Test observation failed");
		expect(text(tree)).not.toContain("Your Worker is ready");
		for (const callback of [onRetry, onBack]) {
			const action = nodes(tree).find((node) => node.props.onClick === callback)!;
			expect(action.props.disabled).toBe(false);
			action.props.onClick();
			expect(callback).toHaveBeenCalledOnce();
		}
	});
});
