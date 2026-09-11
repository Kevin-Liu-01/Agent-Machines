import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

type Element = { type: unknown; props: Record<string, any> };
type ResponseStub = { ok: boolean; status: number; json: () => Promise<unknown> };
const response = (body: unknown, ok = true): ResponseStub => ({ ok, status: ok ? 200 : 400, json: async () => body });
function nodes(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(nodes);
	if (!value || typeof value !== "object" || !("props" in value)) return [];
	const element = value as Element;
	return [element, ...nodes(element.props.children)];
}
function text(value: unknown): string {
	if (Array.isArray(value)) return value.map(text).join("");
	return typeof value === "string" ? value : value && typeof value === "object" ? text((value as Element).props.children) : "";
}

/** Execute the production handlers with a mocked HTTP boundary. No imports,
 * providers, machines, or real account mutations are invoked by these tests. */
function mount(send: () => Promise<ResponseStub>) {
	const cells: Array<{ value: any }> = [];
	let cursor = 0;
	const cell = (initial: unknown) => { const index = cursor++; return cells[index] ?? (cells[index] = { value: initial }); };
	const react = {
		useState(initial: unknown) { const state = cell(initial); return [state.value, (value: any) => { state.value = typeof value === "function" ? value(state.value) : value; }]; },
		useRef(initial: unknown) { return cell({ current: initial }).value; },
		useCallback: (callback: unknown) => callback,
	};
	const fetch = vi.fn(async (_url: string, _options: unknown) => send());
	const onAdded = vi.fn();
	const module = { exports: {} as { AddSkillPanel: (props: unknown) => Element } };
	const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
	runInNewContext(ts.transpileModule(readFileSync(resolve(process.cwd(), "components/dashboard/AddSkillPanel.tsx"), "utf8"), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
	}).outputText, {
		module, exports: module.exports, fetch,
		require: (id: string) => id === "react" ? react : id === "react/jsx-runtime" ? { jsx, jsxs: jsx }
			: id.endsWith("/cn") ? { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }
				: new Proxy({}, { get: (_target, key) => key === "ReticleButton" ? "button" : () => null }),
	});
	let tree: Element;
	const render = () => { cursor = 0; tree = module.exports.AddSkillPanel({ customSkills: [], onAdded }); };
	const all = () => nodes(tree);
	const button = (label: string) => all().find((node) => node.type === "button" && text(node).trim() === label)!;
	const field = (label: string) => {
		const wrapper = all().find((node) => node.type === "label" && text(node).startsWith(label));
		return nodes(wrapper).find((node) => node.type === "input" || node.type === "textarea")!;
	};
	render();
	return {
		fetch, onAdded, all, button, field, render,
		copy: () => text(tree),
		click(label: string) { button(label).props.onClick(); render(); },
		change(label: string, value: string) { field(label).props.onChange({ target: { value } }); render(); },
		async settled() { await vi.waitFor(() => { render(); expect(all().find((node) => node.type === "fieldset")?.props.disabled).toBe(false); }); },
	};
}

const saved = { ok: true, skill: { slug: "my-skill", name: "My skill", path: "~/.agent-machines/skills/custom/my-skill/SKILL.md" } };

describe("custom skill installation presentation", () => {
	it("blocks empty submissions and states the running-machine and metadata prerequisite", () => {
		const ui = mount(async () => response(saved));
		ui.click("Add skill");
		expect(ui.copy()).toContain("selected machine to be running");
		expect(ui.copy()).toContain("pasted instructions are not stored in account settings");
		expect(ui.button("Save and install").props.disabled).toBe(true);
		ui.click("Save and install");
		expect(ui.fetch).not.toHaveBeenCalled();
	});

	it.each([false, undefined])("retains pasted input for metadata-only results with installOk=%s", async (installOk) => {
		const ui = mount(async () => response({ ...saved, installOk, installLog: "Test install unavailable" }));
		ui.click("Add skill");
		ui.change("Slug", "my-skill"); ui.change("Display name", "My skill");
		ui.change("Description override", "Test purpose"); ui.change("SKILL.md content", "# Instructions\nKeep this content");
		ui.click("Save and install"); await ui.settled();
		expect(ui.field("SKILL.md content").props.value).toBe("# Instructions\nKeep this content");
		expect(ui.field("Slug").props.value).toBe("my-skill");
		expect(ui.field("Display name").props.value).toBe("My skill");
		expect(ui.field("Description override").props.value).toBe("Test purpose");
		expect(ui.copy()).toContain("Metadata saved · not installed");
		expect(ui.copy()).toContain("Nothing is queued for automatic installation");
		expect(ui.copy()).not.toContain("machine offline");
		expect(ui.copy()).toContain("Intended path");
		expect(ui.onAdded).toHaveBeenCalledOnce();
		ui.click("Close"); ui.click("Add skill");
		expect(ui.field("SKILL.md content").props.value).toBe("# Instructions\nKeep this content");
	});

	it.each(["Import URL", "Absorb link"])("retains %s for an unsuccessful install", async (mode) => {
		const ui = mount(async () => response({ ...saved, installOk: false }));
		ui.click("Add skill"); ui.click(mode);
		const label = mode === "Import URL" ? "Skill URL" : "Page URL to absorb";
		ui.change(label, "https://example.invalid/my-skill");
		ui.click("Save and install"); await ui.settled();
		expect(ui.field(label).props.value).toBe("https://example.invalid/my-skill");
		expect(ui.copy()).toContain("Metadata saved · not installed");
	});

	it.each(["http", "network", "malformed"])("keeps the draft when the %s outcome is unconfirmed", async (failure) => {
		const ui = mount(async () => {
			if (failure === "network") throw new Error("Response lost");
			return failure === "http" ? response({ ok: false, error: "Test rejected" }, false) : response({ installOk: true });
		});
		ui.click("Add skill"); ui.change("SKILL.md content", "# Preserve me");
		ui.click("Save and install"); await ui.settled();
		expect(ui.field("SKILL.md content").props.value).toBe("# Preserve me");
		expect(ui.all().find((node) => node.props.role === "alert")).toBeDefined();
		expect(ui.copy()).toContain("result could not be confirmed");
		expect(ui.onAdded).not.toHaveBeenCalled();
	});

	it("clears the form only after the machine installation is confirmed", async () => {
		const ui = mount(async () => response({ ...saved, installOk: true }));
		ui.click("Add skill"); ui.change("Slug", " my-skill "); ui.change("SKILL.md content", "# Installed content");
		ui.click("Save and install"); await ui.settled();
		expect(ui.field("SKILL.md content").props.value).toBe("");
		expect(ui.field("Slug").props.value).toBe("");
		expect(ui.copy()).toContain("Installed on machine");
		expect(ui.copy()).toContain("Installed path");
		expect(ui.onAdded).toHaveBeenCalledOnce();
		expect(JSON.parse((ui.fetch.mock.calls[0][1] as { body: string }).body)).toMatchObject({ mode: "paste", slug: "my-skill", content: "# Installed content" });
	});

	it("guards same-tick double submit and freezes close, mode, and inputs while pending", async () => {
		let finish!: (result: ResponseStub) => void;
		const ui = mount(() => new Promise((resolve) => { finish = resolve; }));
		ui.click("Add skill"); ui.change("SKILL.md content", "# Keep while pending");
		const submit = ui.button("Save and install").props.onClick;
		const close = ui.button("Close").props.onClick;
		const switchTab = ui.button("Import URL").props.onClick;
		submit(); submit(); close(); switchTab(); ui.render();
		expect(ui.fetch).toHaveBeenCalledOnce();
		expect(ui.button("Close").props.disabled).toBe(true);
		expect(ui.button("Import URL").props.disabled).toBe(true);
		expect(ui.button("Paste SKILL.md").props["aria-pressed"]).toBe(true);
		expect(ui.all().find((node) => node.type === "fieldset")?.props).toMatchObject({ disabled: true, "aria-busy": true });
		expect(ui.field("SKILL.md content").props.value).toBe("# Keep while pending");
		const preventDefault = vi.fn();
		ui.all().find((node) => node.props.href === "/dashboard/registry")!.props.onClick({ preventDefault });
		expect(preventDefault).toHaveBeenCalledOnce();
		finish(response({ ...saved, installOk: false })); await ui.settled();
		expect(ui.button("Close").props.disabled).toBe(false);
		expect(ui.button("Import URL").props.disabled).toBe(false);
	});
});
