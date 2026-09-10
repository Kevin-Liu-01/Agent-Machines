import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { AGENT_LABEL, PROVIDER_KINDS, PROVIDER_LABEL } from "@/lib/user-config/schema";

type Element = { type: unknown; props: Record<string, unknown> };
function elements(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(elements);
	if (!value || typeof value !== "object") return [];
	const element = value as Element;
	return [element, ...elements(element.props?.children)];
}
function text(value: unknown): string {
	if (Array.isArray(value)) return value.map(text).join(" ");
	if (typeof value === "string" || typeof value === "number") return String(value);
	if (value && typeof value === "object") return text((value as Element).props?.children);
	return "";
}

// Execute the real TSX components. Exporting private components only in this
// test adapter lets us check visible copy and picker values without a browser
// or adding test-only exports to the production wizard.
const source = readFileSync(resolve(process.cwd(), "components/dashboard/OnboardingFlow.tsx"), "utf8");
const module = { exports: {} as Record<string, (props: Record<string, unknown>) => Element> };
const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
runInNewContext(ts.transpileModule(`${source}\nexport { AgentStep, PresetStep, ProviderPickStep, ProviderComparison, BootStep, RigPreview };`, {
	compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, {
	module, exports: module.exports,
	require: (id: string) => id === "react/jsx-runtime" ? { jsx, jsxs: jsx }
		: id.endsWith("user-config/schema") ? { AGENT_LABEL, PROVIDER_KINDS, PROVIDER_LABEL }
			: new Proxy({}, { get: () => () => null }),
});
const wizard = module.exports;
const preset = { id: "coding-agent", name: "Coding Agent", description: "Project instructions", skillIds: ["git", "tests"], mcpServerIds: ["github"] };

describe("onboarding wording and unchanged picker values (actual TSX)", () => {
	it("offers all four runtimes without a universal HTTP API or fixed HOME claim", () => {
		const picked: string[] = [];
		const tree = wizard.AgentStep({ value: "hermes", onPick: (value: string) => picked.push(value), onNext() {} });
		for (const button of elements(tree).filter((node) => node.type === "button")) {
			(button.props.onClick as () => void)();
		}
		expect(picked).toEqual(["hermes", "openclaw", "claude-code", "codex"]);
		const copy = text(tree).replace(/\s+/g, " ");
		expect(copy).toContain("four agent runtimes");
		expect(copy).toContain("native CLIs");
		expect(copy).toContain("No agent HTTP gateway is required");
		expect(copy).toContain("path depends on the provider");
		expect(copy).toContain("configure and enable a schedule");
		expect(copy).not.toMatch(/Both run|\/home\/machine|same OpenAI-compatible API|instant recall|wake the VM on tick|ddls cookbook/i);
		expect(elements(tree).filter((node) => node.type === "a").map((node) => node.props.href).join(" ")).not.toMatch(/dedalus|ddls/i);
	});

	it("labels specialist tools as selected, not installed, and keeps the blank catalog available", () => {
		const picked: string[] = [];
		const tree = wizard.PresetStep({ presets: [preset], selectedId: preset.id, onPick: (value: string) => picked.push(value), onBack() {}, onNext() {} });
		for (const button of elements(tree).filter((node) => node.type === "button")) (button.props.onClick as () => void)();
		expect(picked).toEqual(["coding-agent", "__none__"]);
		const copy = text(tree).replace(/\s+/g, " ");
		expect(copy).toContain("Skills: 2 · MCP servers: 1");
		expect(copy).toContain("Connected tools may still need credentials or setup");
		expect(copy).toContain("No specialist preset selected");
		expect(copy).toContain("bundled Registry catalog");
		expect(copy).not.toContain("library starts empty");
		const preview = wizard.RigPreview({ agent: "hermes", provider: "e2b", preset: null, bootPhase: null, bootDone: false });
		expect(text(preview)).toContain("bundled Registry catalog remains available");
		expect(elements(preview).filter((node) => node.props.label).map((node) => node.props.label)).toEqual(["selected skills", "selected MCP servers"]);
	});

	it("preserves all provider choices without unverified speed or unlimited-lifetime promises", () => {
		const picked: string[] = [];
		const configured = Object.fromEntries(PROVIDER_KINDS.map((kind) => [kind, { configured: false }]));
		const tree = wizard.ProviderPickStep({ value: "e2b", configured, onPick: (value: string) => picked.push(value), onBack() {}, onNext() {} });
		for (const button of elements(tree).filter((node) => node.type === "button")) (button.props.onClick as () => void)();
		expect(picked).toEqual(PROVIDER_KINDS);
		expect(picked).toEqual(["daytona", "e2b", "sprites", "vercel"]);
		const comparison = wizard.ProviderComparison({ selected: "e2b" });
		const copy = text([tree, comparison]).replace(/\s+/g, " ");
		expect(copy).toContain("first launch also installs");
		expect(copy).toContain("Filesystem only");
		expect(copy).toContain("Launch time and limits vary");
		expect(copy).toContain("Stop / start; files retained");
		const providerRows = elements(comparison).filter((node) => node.type === "tr");
		const typeRow = providerRows.find((node) => text(node).startsWith("Type"));
		expect(text(typeRow)).toContain("Persistent sandbox");
		expect(text(typeRow)).not.toMatch(/Persistent VM\b/);
		expect(copy).not.toMatch(/Dedalus/i);
		expect(copy).not.toMatch(/instant|sub-second|unlimited|forever|~\d|300ms|getOrCreate|fork/i);
	});

	it.each(["hermes", "openclaw", "claude-code", "codex"])("does not claim selected tools or an HTTP gateway are installed for %s", (agent) => {
		const copy = text(wizard.BootStep({ agent, provider: "e2b", machineId: null, phase: null, done: false, busy: true, error: null, onRetry() {}, onBack() {} }));
		expect(copy).toContain("Selected tools may need additional setup");
		expect(copy).toContain("Prepare memory and configure");
		expect(copy).not.toMatch(/Install loadout|wires the gateway/);
	});
});
