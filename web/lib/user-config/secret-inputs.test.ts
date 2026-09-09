import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { agentCredentialRequirements } from "@/lib/agents/credentials";
import { agentUsesRouter } from "@/lib/agents/upstreams";
import * as schema from "@/lib/user-config/schema";

type Element = { type: unknown; props: Record<string, unknown> };
function elements(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(elements);
	if (!value || typeof value !== "object") return [];
	const element = value as Element;
	return [element, ...elements(element.props?.children)];
}
function text(value: unknown): string {
	if (Array.isArray(value)) return value.map(text).join("");
	if (typeof value === "string") return value;
	return value && typeof value === "object" ? text((value as Element).props?.children) : "";
}
function loadTsx(file: string, extraExports: string, overrides: Record<string, unknown> = {}, globals: Record<string, unknown> = {}) {
	const module = { exports: {} as Record<string, (props: Record<string, unknown>) => Element> };
	const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
	const source = readFileSync(resolve(process.cwd(), file), "utf8");
	runInNewContext(ts.transpileModule(`${source}\n${extraExports}`, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
	}).outputText, {
		module, exports: module.exports, ...globals,
		require: (id: string) => overrides[id] ?? (id === "react/jsx-runtime" ? { jsx, jsxs: jsx }
			: id.endsWith("user-config/schema") ? schema
				: id === "@/lib/agents" ? { AGENTS: [] }
					: new Proxy({}, { get: () => () => null })),
	});
	return module.exports;
}
function publicConfig() {
	const config = schema.toPublicConfig(structuredClone(schema.DEFAULT_USER_CONFIG));
	for (const provider of Object.values(config.providers)) provider.configured = true;
	for (const provider of Object.values(config.aiProviders)) provider.configured = true;
	config.hasCursorKey = true;
	return config;
}
function mountSettings() {
	const config = publicConfig(), state: Array<{ value: unknown }> = [], requests: Record<string, unknown>[] = [];
	let cursor = 0;
	const react = {
		useState(initial: unknown) {
			const index = cursor++;
			const cell = state[index] ?? (state[index] = { value: initial });
			return [cell.value, (value: unknown) => { cell.value = typeof value === "function" ? value(cell.value) : value; }];
		},
		useEffect() {},
	};
	const component = loadTsx("components/dashboard/SettingsPanel.tsx", "", { react }, {
		fetch: async (_url: string, options: { body: string }) => {
			requests.push(JSON.parse(options.body));
			return { ok: true, json: async () => ({ config }) };
		},
	});
	let tree: Element;
	function render() { cursor = 0; tree = component.SettingsPanel({ initialConfig: config }); }
	function fields() {
		const result = new Map<string, Element>();
		for (const node of elements(tree)) {
			if (typeof node.type === "function" && ["ProviderBox", "AiProviderBox"].includes(node.type.name)) {
				const box = (node.type as (props: Record<string, unknown>) => Element)(node.props);
				for (const label of elements(box).filter((item) => item.type === "label")) {
					result.set(`${node.props.title}/${text(label).trim()}`, elements(label).find((item) => item.type === "input")!);
				}
			}
			if (node.type === "label" && text(node).trim() === "Cursor API key") {
				result.set("Cursor/API key", elements(node).find((item) => item.type === "input")!);
			}
		}
		return result;
	}
	render();
	return {
		fields, requests,
		change(name: string, value: string) {
			(fields().get(name)!.props.onChange as (event: unknown) => void)({ target: { value } });
			render();
		},
		async save() {
			const button = elements(tree).find((node) => text(node).trim() === "Save settings" && typeof node.props.onClick === "function")!;
			(button.props.onClick as () => void)();
			await Promise.resolve();
		},
	};
}

const secretFields = ["Dedalus/API key", "E2B Sandbox/API key", "Sprites/Token", "Vercel Sandbox/Token", "Cursor/API key", "Vercel AI Gateway/API key", "OpenRouter/API key", "Anthropic/API key", "OpenAI/API key", "Google AI/API key", "Custom gateway/API key"];
const plainFields = ["Dedalus/Base URL", "Vercel Sandbox/Team ID", "Vercel Sandbox/Project ID", "Custom gateway/Label", "Custom gateway/Base URL"];
const privateInputProps = { type: "password", autoComplete: "off", autoCapitalize: "none", autoCorrect: "off", spellCheck: false };

describe("credential input privacy (actual Settings and wizard TSX)", () => {
	it("masks all 11 Settings secrets but leaves URLs, labels, and scope identifiers readable", () => {
		const settings = mountSettings(), fields = settings.fields();
		expect([...fields.keys()].sort()).toEqual([...secretFields, ...plainFields].sort());
		for (const name of secretFields) expect(fields.get(name)!.props, name).toMatchObject({ ...privateInputProps, value: "" });
		for (const name of plainFields) expect(fields.get(name)!.props, name).toMatchObject({ type: "text", value: "" });
	});

	it("keeps configured secrets blank and omits them from a save until a replacement is entered", async () => {
		const settings = mountSettings();
		await settings.save();
		expect(settings.requests[0]).not.toHaveProperty("providers");
		expect(settings.requests[0]).not.toHaveProperty("aiProviderKeys");
		expect(settings.requests[0]).not.toHaveProperty("cursorApiKey");
		settings.change("Anthropic/API key", "  fixture-replacement-key  ");
		expect(settings.fields().get("Anthropic/API key")!.props).toMatchObject({ ...privateInputProps, value: "  fixture-replacement-key  " });
		await settings.save();
		expect(settings.requests[1].aiProviderKeys).toEqual({ anthropic: "fixture-replacement-key" });
		expect(settings.requests[1]).not.toHaveProperty("providers");
		expect(settings.requests[1]).not.toHaveProperty("cursorApiKey");
	});

	it.each(schema.AGENT_KINDS)("masks wizard keys for %s without masking the Vercel team/project identifiers", (agent) => {
		const wizard = loadTsx("components/dashboard/OnboardingFlow.tsx", "export { KeyStep };", {
			"@/lib/agents/credentials": { agentCredentialRequirements },
			"@/lib/agents/upstreams": { agentUsesRouter },
		});
		const tree = wizard.KeyStep({ agent, provider: "vercel", config: publicConfig(), readiness: {}, substrateReady: true, hasKey: true, value: "", onChange() {}, aiKeys: { vercelAiGateway: "", openrouter: "", anthropic: "", openai: "" }, onAiKeyChange() {}, agentCredsOk: true, secondary: {}, onSecondaryChange() {}, busy: false, canProvision: true, onBack() {}, onProvision() {} });
		const fields = elements(tree).filter((node) => node.type === "input");
		const secrets = fields.filter((node) => node.props.type === "password");
		expect(secrets).toHaveLength(1 + agentCredentialRequirements(agent).length);
		for (const field of secrets) expect(field.props).toMatchObject({ ...privateInputProps, value: "" });
		expect(fields.filter((node) => node.props.type === "text").map((node) => node.props.placeholder)).toEqual(["team_…", "prj_…"]);
	});
});
