import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { validateAgentCredentials } from "@/lib/agents/credentials";
import * as schema from "@/lib/user-config/schema";

type Element = { type: unknown; props: Record<string, any> };
function nodes(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(nodes);
	if (!value || typeof value !== "object" || !("props" in value)) return [];
	const element = value as Element;
	return [element, ...nodes(element.props.children)];
}

function fixture(configured = true) {
	let cursor = 0;
	const cells: unknown[] = [];
	const config = schema.toPublicConfig(structuredClone(schema.DEFAULT_USER_CONFIG));
	config.providers.daytona.configured = configured;
	config.aiProviders.openai.configured = true;
	config.aiProviders.anthropic.configured = true;
	const request = vi.fn(async () => ({ ok: true, json: async () => ({ operation: { id: "fixture-operation" } }) }));
	const done = vi.fn(), refresh = vi.fn(async () => {});
	const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
	const module = { exports: {} as { QuickProvisionForm: (props: Record<string, unknown>) => Element } };
	const source = readFileSync(resolve(process.cwd(), "components/dashboard/MachinesPanel.tsx"), "utf8");
	runInNewContext(ts.transpileModule(`${source}\nexport { QuickProvisionForm };`, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
	}).outputText, {
		module, exports: module.exports, fetch: request,
		require: (id: string) => id === "react/jsx-runtime" ? { jsx, jsxs: jsx }
			: id === "react" ? { useState: (initial: unknown) => {
				const index = cursor++;
				if (!(index in cells)) cells[index] = typeof initial === "function" ? initial() : initial;
				return [cells[index], (value: unknown) => { cells[index] = typeof value === "function" ? value(cells[index]) : value; }];
			} }
				: id.endsWith("user-config/schema") ? schema
					: id.endsWith("DashboardConfigProvider") ? { useDashboardConfig: () => config }
						: id.endsWith("agents/credentials") ? { validateAgentCredentials }
							: id.endsWith("control-plane/client") ? { waitForControlPlaneOperation: async () => ({ machineId: "created-machine" }) }
								: new Proxy({}, { get: () => () => null }),
	});
	const render = () => { cursor = 0; return module.exports.QuickProvisionForm({ onRefresh: refresh, onDone: done, onCancel: vi.fn() }); };
	return { render, config, request, done, refresh };
}

describe("fleet quick launch form", () => {
	it("leaves model selection to the endpoint-aware server default and clears it when runtime changes", async () => {
		const ui = fixture();
		let tree = ui.render();
		const field = () => nodes(tree).find((node) => node.props.label === "Model ID (optional)")!;
		expect(field().props.value).toBe("");
		field().props.onChange("custom-hermes-model");
		tree = ui.render();
		nodes(tree).find((node) => node.props.ariaLabel === "Agent")!.props.onChange("codex");
		tree = ui.render();
		expect(field().props.value).toBe("");
		const launch = nodes(tree).find((node) => node.props.variant === "primary")!;
		expect(launch.props.disabled).toBe(false);
		launch.props.onClick();
		await vi.waitFor(() => expect(ui.done).toHaveBeenCalledOnce());
		expect(ui.request).toHaveBeenCalledOnce();
		const [url, options] = ui.request.mock.calls[0] as unknown as [string, { body: string }];
		expect(url).toBe("/api/dashboard/admin/provision-machine");
		expect(JSON.parse(options.body)).toMatchObject({ providerKind: "daytona", agentKind: "codex" });
		expect(JSON.parse(options.body)).not.toHaveProperty("model");
		expect(ui.refresh).toHaveBeenCalledOnce();
	});

	it("blocks launch when compute credentials are missing, including direct handler invocation", () => {
		const ui = fixture(false);
		const launch = nodes(ui.render()).find((node) => node.props.variant === "primary")!;
		expect(launch.props.disabled).toBe(true);
		launch.props.onClick();
		expect(ui.request).not.toHaveBeenCalled();
		expect(ui.done).not.toHaveBeenCalled();
	});

	it("blocks a native runtime when only the other model provider is configured", () => {
		const ui = fixture();
		ui.config.aiProviders.openai.configured = false;
		nodes(ui.render()).find((node) => node.props.ariaLabel === "Agent")!.props.onChange("codex");
		const launch = nodes(ui.render()).find((node) => node.props.variant === "primary")!;
		expect(launch.props.disabled).toBe(true);
		launch.props.onClick();
		expect(ui.request).not.toHaveBeenCalled();
	});
});
