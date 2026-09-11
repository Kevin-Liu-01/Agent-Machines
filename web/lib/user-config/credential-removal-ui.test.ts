import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as credentials from "./credential-removal";
import * as schema from "./schema";

type Element = { type: unknown; props: Record<string, any> };
type ResponseStub = { ok: boolean; json: () => Promise<unknown> };
const response = (body: unknown, ok = true): ResponseStub => ({ ok, json: async () => body });

function elements(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(elements);
	if (!value || typeof value !== "object" || !("props" in value)) return [];
	const node = value as Element;
	return [node, ...elements(node.props.children)];
}
function text(value: unknown): string {
	if (Array.isArray(value)) return value.map(text).join("");
	if (typeof value === "string") return value;
	return value && typeof value === "object" ? text((value as Element).props?.children) : "";
}
function publicConfig(configured: readonly credentials.CredentialSelector[]) {
	const config = schema.toPublicConfig(structuredClone(schema.DEFAULT_USER_CONFIG));
	for (const [key, status] of Object.entries(config.providers)) status.configured = configured.includes(`provider:${key}` as credentials.CredentialSelector);
	for (const [key, status] of Object.entries(config.aiProviders)) status.configured = configured.includes(`model:${key}` as credentials.CredentialSelector);
	config.hasCursorKey = configured.includes("cursor");
	return config;
}

/** Executes the actual SettingsPanel handlers, hook state and credential boxes.
 * Only external visual components are inert. No real network or credentials. */
function mount(options: {
	configured?: credentials.CredentialSelector[];
	confirm?: boolean;
	remove?: () => Promise<ResponseStub>;
	refresh?: ResponseStub;
} = {}) {
	const config = publicConfig(options.configured ?? ["provider:daytona", "model:anthropic"]);
	const cells: Array<{ value: any }> = [];
	let cursor = 0;
	function cell(initial: unknown) { const index = cursor++; return cells[index] ?? (cells[index] = { value: initial }); }
	const react = {
		useState(initial: unknown) { const state = cell(initial); return [state.value, (value: any) => { state.value = typeof value === "function" ? value(state.value) : value; }]; },
		useRef(initial: unknown) { return cell({ current: initial }).value; },
		useEffect() {},
	};
	const confirm = vi.fn((_message: string) => options.confirm ?? true);
	const fetch = vi.fn(async (_url: string, init?: { method?: string; body?: string }) => {
		if (init?.method === "DELETE") return options.remove ? options.remove() : response({ removed: JSON.parse(init.body!).credentials, stillConfigured: [] });
		if (init?.method === "POST") return response({ config });
		return options.refresh ?? response({ config: publicConfig([]) });
	});
	const module = { exports: {} as { SettingsPanel: (props: unknown) => Element } };
	const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
	runInNewContext(ts.transpileModule(readFileSync(resolve(process.cwd(), "components/dashboard/SettingsPanel.tsx"), "utf8"), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
	}).outputText, {
		module, exports: module.exports, fetch, window: { confirm },
		require: (id: string) => id === "react" ? react : id === "react/jsx-runtime" ? { jsx, jsxs: jsx }
			: id.endsWith("/credential-removal") ? credentials : id.endsWith("/schema") ? schema
				: id === "@/lib/agents" ? { AGENTS: [] } : new Proxy({}, { get: () => () => null }),
	});
	let tree: Element;
	function render() { cursor = 0; tree = module.exports.SettingsPanel({ initialConfig: config }); }
	function nodes() { return elements(tree); }
	function selector() { return nodes().find((node) => node.props.ariaLabel === "Saved credential to remove")!; }
	function button(label: string) { return nodes().find((node) => text(node).trim() === label && typeof node.props.onClick === "function")!; }
	function input(boxTitle: string, fieldLabel: string) {
		const box = nodes().find((node) => node.props.title === boxTitle && typeof node.type === "function" && ["ProviderBox", "AiProviderBox"].includes(node.type.name))!;
		const labels = elements((box.type as (props: unknown) => Element)(box.props)).filter((node) => node.type === "label");
		return elements(labels.find((node) => text(node).trim() === fieldLabel)).find((node) => node.type === "input")!;
	}
	render();
	return {
		fetch, confirm, nodes, selector, button, input,
		status: () => text(nodes().find((node) => node.props.role === "status")),
		select(value: string) { selector().props.onChange(value); render(); },
		click(label: string) { button(label).props.onClick(); render(); },
		change(title: string, label: string, value: string) { input(title, label).props.onChange({ target: { value } }); render(); },
		async settle() { for (let i = 0; i < 20; i++) await Promise.resolve(); render(); },
	};
}

describe("saved credential removal (actual Settings TSX)", () => {
	it("lists only configured human-labelled credentials, including a removable retired slot", () => {
		const ui = mount({ configured: ["provider:e2b", "provider:dedalus", "model:anthropic", "cursor"] });
		expect(ui.selector().props.options).toEqual([
			{ value: "provider:e2b", label: "E2B" }, { value: "provider:dedalus", label: "Dedalus (retired)" },
			{ value: "model:anthropic", label: "Anthropic" }, { value: "cursor", label: "Cursor" },
		]);
		expect(ui.button("Remove saved credential").props.disabled).toBe(true);
		ui.select("provider:e2b");
		expect(ui.button("Remove saved credential").props.disabled).toBe(false);
	});

	it("cannot remove an unconfigured or unknown credential", () => {
		const ui = mount({ configured: [] });
		expect(ui.selector().props.options).toEqual([]);
		ui.select("provider:e2b");
		ui.click("Remove saved credential");
		expect(ui.confirm).not.toHaveBeenCalled();
		expect(ui.fetch).not.toHaveBeenCalled();
	});

	it("asks explicit scope/impact confirmation; cancel performs no mutation or refresh", () => {
		const ui = mount({ confirm: false });
		ui.select("provider:daytona");
		ui.click("Remove saved credential");
		expect(ui.confirm).toHaveBeenCalledOnce();
		expect(ui.confirm.mock.calls[0][0]).toContain("saved Daytona credential from this account");
		for (const scope of ["does not revoke", "stop sandboxes", "copies already installed", "Future work may fail", "defaults"]) expect(ui.confirm.mock.calls[0][0]).toContain(scope);
		expect(ui.fetch).not.toHaveBeenCalled();
		expect(ui.button("Remove saved credential").props["aria-describedby"]).toBe("credential-removal-limits");
		expect(ui.nodes().find((node) => node.props.role === "status")?.props["aria-live"]).toBe("polite");
	});

	it.each(credentials.CREDENTIAL_OPTIONS)("removes exactly $id and refreshes redacted Settings", async ({ id }) => {
		const ui = mount({ configured: [id] });
		ui.select(id);
		ui.click("Remove saved credential");
		await ui.settle();
		expect(ui.fetch.mock.calls[0]).toEqual(["/api/dashboard/admin/settings", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credentials: [id] }) }]);
		expect(ui.fetch.mock.calls[1]).toEqual(["/api/dashboard/admin/settings", { cache: "no-store" }]);
		expect(ui.status()).toContain("this account's saved copy was removed");
		expect(ui.selector().props.options).toEqual([]);
	});

	it("preserves blank-to-keep saves and clears only the removed pending credential fields", async () => {
		const ui = mount();
		ui.click("Save settings");
		await ui.settle();
		const blank = JSON.parse(ui.fetch.mock.calls[0][1]!.body!);
		expect(blank).not.toHaveProperty("providers");
		expect(blank).not.toHaveProperty("aiProviderKeys");
		expect(blank).not.toHaveProperty("cursorApiKey");
		ui.change("Daytona", "API key", "not-a-real-key");
		ui.change("Daytona", "API URL", "https://app.daytona.io/api");
		ui.change("Daytona", "Target (optional)", "us");
		ui.change("Anthropic", "API key", "pending-other-key");
		ui.select("provider:daytona");
		ui.click("Remove saved credential");
		await ui.settle();
		for (const field of ["API key", "API URL", "Target (optional)"]) expect(ui.input("Daytona", field).props.value).toBe("");
		expect(ui.input("Anthropic", "API key").props.value).toBe("pending-other-key");
		ui.click("Save settings");
		await ui.settle();
		const saved = JSON.parse(ui.fetch.mock.calls.at(-1)![1]!.body!);
		expect(saved).not.toHaveProperty("providers");
		expect(saved.aiProviderKeys).toEqual({ anthropic: "pending-other-key" });
	});

	it("reports remaining deployment defaults without falsely claiming the provider is disconnected", async () => {
		const ui = mount({ configured: ["provider:daytona"], remove: async () => response({ removed: ["provider:daytona"], stillConfigured: ["provider:daytona"] }), refresh: response({ config: publicConfig(["provider:daytona"]) }) });
		ui.select("provider:daytona");
		ui.click("Remove saved credential");
		await ui.settle();
		expect(ui.status()).toContain("Still configured through a deployment-provided default; that default was not removed.");
		expect(ui.selector().props.options).toHaveLength(1);
		expect(ui.button("Remove saved credential").props.disabled).toBe(true);
	});

	it("fails visibly without claiming success on a rejected removal", async () => {
		const ui = mount({ remove: async () => response({ message: "Sign in again before removing credentials." }, false) });
		ui.change("Daytona", "API key", "pending-key");
		ui.select("provider:daytona");
		ui.click("Remove saved credential");
		await ui.settle();
		expect(ui.status()).toBe("Sign in again before removing credentials.");
		expect(ui.input("Daytona", "API key").props.value).toBe("");
		expect(ui.fetch).toHaveBeenCalledOnce();
		expect(ui.button("Remove saved credential").props.disabled).toBe(false);
	});

	it.each(["unverified", "network"])("cannot silently restore the selected credential after an ambiguous %s failure", async (failure) => {
		const ui = mount({ remove: async () => {
			if (failure === "network") throw new Error("Network response lost");
			return response({ error: "credential_removal_unverified", message: "Removal could not be verified. Refresh Settings." }, false);
		} });
		ui.change("Daytona", "API key", "pending-key");
		ui.change("Daytona", "API URL", "https://app.daytona.io/api");
		ui.change("Anthropic", "API key", "pending-other-key");
		ui.select("provider:daytona");
		ui.click("Remove saved credential");
		await ui.settle();
		expect(ui.status()).not.toContain("was removed");
		expect(ui.fetch).toHaveBeenCalledOnce();
		expect(ui.confirm).toHaveBeenCalledOnce();
		ui.click("Save settings");
		await ui.settle();
		const saved = JSON.parse(ui.fetch.mock.calls.at(-1)![1]!.body!);
		expect(saved).not.toHaveProperty("providers");
		expect(saved.aiProviderKeys).toEqual({ anthropic: "pending-other-key" });
	});

	it("distinguishes successful removal from a subsequent failed refresh", async () => {
		const ui = mount({ configured: ["provider:daytona"], refresh: response({}, false) });
		ui.select("provider:daytona");
		ui.click("Remove saved credential");
		await ui.settle();
		expect(ui.status()).toContain("this account's saved copy was removed.");
		expect(ui.status()).toContain("Settings refresh failed");
		expect(ui.selector().props.options).toEqual([]);
	});

	it("blocks duplicate removals and concurrent Settings writes while removal is pending", async () => {
		let finish!: (value: ResponseStub) => void;
		const ui = mount({ remove: () => new Promise((resolve) => { finish = resolve; }) });
		ui.select("provider:daytona");
		ui.click("Remove saved credential");
		expect(ui.nodes().find((node) => node.type === "fieldset")?.props.disabled).toBe(true);
		ui.click("Removing…");
		ui.click("Save settings");
		ui.click("Sync from machine");
		ui.nodes().find((node) => node.props.label === "Agent runtime")!.props.onChange("hermes");
		expect(ui.fetch).toHaveBeenCalledOnce();
		finish(response({ removed: ["provider:daytona"], stillConfigured: [] }));
		await ui.settle();
		expect(ui.nodes().find((node) => node.type === "fieldset")?.props.disabled).toBe(false);
	});
});
