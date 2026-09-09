import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type Element = { type: unknown; props: Record<string, unknown> };
function elements(value: unknown): Element[] {
	if (Array.isArray(value)) return value.flatMap(elements);
	if (!value || typeof value !== "object") return [];
	const element = value as Element;
	return [element, ...elements(element.props?.children)];
}
function mountLibrary() {
	const libraryState: Array<{ value: unknown }> = [], modalState: Array<{ value: unknown }> = [];
	let activeState = libraryState, cursor = 0;
	const submitted: Record<string, unknown>[] = [], navigation: string[] = [];
	let response = { status: 200, body: { ok: true, worker: { id: "new-worker" } } as Record<string, unknown> };
	const react = {
		useState(initial: unknown) {
			const index = cursor++;
			const current = activeState[index] ?? (activeState[index] = { value: typeof initial === "function" ? initial() : initial });
			return [current.value, (next: unknown) => { current.value = typeof next === "function" ? next(current.value) : next; }];
		},
		useCallback(fn: unknown) { return fn; },
		useEffect() {},
	};
	function ReticleButton() { return null; }
	const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
	const module = { exports: {} as { WorkersLibrary: (props: Record<string, unknown>) => Element } };
	const source = readFileSync(resolve(process.cwd(), "components/dashboard/WorkersLibrary.tsx"), "utf8");
	runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
		module, exports: module.exports,
		require: (id: string) => id === "react" ? react : id === "react/jsx-runtime" ? { jsx, jsxs: jsx }
			: id === "next/navigation" ? { useRouter: () => ({ push: (path: string) => navigation.push(path) }) }
				: id.endsWith("ReticleButton") ? { ReticleButton }
					: id.endsWith("preset-selection") ? { workerPresetSeed: () => ({ name: "Custom Worker", sourceValue: "bundle:default" }) }
						: id.endsWith("user-config/schema") ? { AGENT_KINDS: ["hermes"], AGENT_LABEL: { hermes: "Hermes" } }
							: new Proxy({}, { get: () => () => null }),
		fetch: async (_url: string, options: { body: string }) => {
			submitted.push(JSON.parse(options.body));
			return { ok: response.status < 400, status: response.status, json: async () => response.body };
		},
	});
	let modal: Element;
	const render = () => {
		activeState = libraryState; cursor = 0;
		const tree = module.exports.WorkersLibrary({ presets: [] });
		const component = elements(tree).find((element) => typeof element.type === "function" && element.type.name === "CreateWorkerModal")!;
		activeState = modalState; cursor = 0;
		modal = (component.type as (props: Record<string, unknown>) => Element)(component.props);
	};
	render();
	return {
		submitted, navigation,
		modelField: () => elements(modal).find((element) => element.type === "input" && element.props.id === "create-worker-model")!,
		nodes: () => elements(modal),
		changeModel(value: string) {
			const field = elements(modal).find((element) => element.type === "input" && element.props.id === "create-worker-model")!;
			(field.props.onChange as (event: unknown) => void)({ target: { value } });
			render();
		},
		setResponse(status: number, body: Record<string, unknown>) { response = { status, body }; },
		async submit() {
			const button = elements(modal).find((element) => element.type === ReticleButton)!;
			await (button.props.onClick as () => Promise<void>)();
			render();
		},
	};
}

describe("Library optional model ID (actual TSX)", () => {
	it.each(["", "   "])("omits a blank model %j to allow endpoint-aware defaults", async (model) => {
		const library = mountLibrary();
		library.changeModel(model);
		await library.submit();
		expect(library.submitted[0]).toEqual({ name: "Custom Worker", agentKind: "hermes", memoryBundleId: "default" });
		expect(library.navigation).toEqual(["/dashboard/workers/new-worker"]);
	});

	it("exposes a labelled field and keeps the server correction message visible inside the open modal", async () => {
		const library = mountLibrary();
		expect(library.modelField().props["aria-describedby"]).toBe("create-worker-model-help");
		expect(library.nodes().find((element) => element.type === "label" && element.props.htmlFor === "create-worker-model")?.props.children).toBe("Model ID (optional)");
		expect(library.nodes().find((element) => element.props.id === "create-worker-model-help")?.props.children).toContain("Google and custom endpoints require the exact model ID");
		library.setResponse(400, { error: "model_required", message: "Enter the exact model ID supported by this endpoint." });
		await library.submit();
		expect(library.nodes().find((element) => element.props.role === "alert")?.props.children).toBe("Enter the exact model ID supported by this endpoint.");
		expect(library.navigation).toEqual([]);
		library.changeModel("  my-org/custom-model-v2  ");
		library.setResponse(200, { ok: true, worker: { id: "new-worker" } });
		await library.submit();
		expect(library.submitted[1]).toMatchObject({ model: "my-org/custom-model-v2" });
		expect(library.navigation).toEqual(["/dashboard/workers/new-worker"]);
		expect(library.nodes().find((element) => element.props.role === "alert")).toBeUndefined();
	});
});
