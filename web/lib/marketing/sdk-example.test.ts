import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

import { INSTALL_CODE, SDK_EXAMPLE } from "@/components/StatsRow";

function typeDiagnostics(sources: Record<string, string>) {
	const virtualFiles = new Map(Object.entries(sources).map(([name, source]) => [resolve(process.cwd(), name), source]));
	const options: ts.CompilerOptions = {
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		target: ts.ScriptTarget.ES2022,
		strict: true,
		noEmit: true,
		skipLibCheck: true,
		types: ["node"],
		baseUrl: process.cwd(),
		// Resolve the public package root to its current source, never a handwritten stub.
		paths: { "agent-machines": ["../src/index.ts"] },
	};
	const host = ts.createCompilerHost(options);
	const readSource = host.getSourceFile.bind(host);
	host.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) => virtualFiles.has(path)
		? ts.createSourceFile(path, virtualFiles.get(path)!, languageVersion, true)
		: readSource(path, languageVersion, onError, shouldCreateNewSourceFile);
	return ts.getPreEmitDiagnostics(ts.createProgram([...virtualFiles.keys()], options, host))
		.filter((entry) => entry.category === ts.DiagnosticCategory.Error)
		.map((entry) => ({ file: entry.file?.fileName, message: ts.flattenDiagnosticMessageText(entry.messageText, "\n") }));
}

function exampleFixture({ backup = false, exitCode = 0, truncated = false, streamError = false } = {}) {
	const result = vi.fn(async () => ({ exitCode, truncated }));
	const stream = {
		async *[Symbol.asyncIterator]() {
			yield { type: "status", label: "Starting" };
			yield { type: "text", delta: "README.md\n" };
			if (streamError) throw new Error("Fixture stream interrupted");
		},
		result,
	};
	const worker = { run: vi.fn(() => stream), destroy: vi.fn(async () => {}) };
	const create = vi.fn(async () => worker);
	const createMux = vi.fn(() => ({ create }));
	const write = vi.fn();
	const compiled = ts.transpileModule(SDK_EXAMPLE, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
	}).outputText;
	return {
		worker, create, createMux, write, result,
		async execute() {
			// Only the package boundary is replaced. The displayed code, iteration,
			// result check, and finally cleanup execute unchanged and cannot access a provider.
			await runInNewContext(`(async () => { ${compiled} })()`, {
				exports: {},
				require: (name: string) => {
					if (name !== "agent-machines") throw new Error(`Unexpected import: ${name}`);
					return { createMux };
				},
				process: { env: backup ? { E2B_API_KEY: "fixture-backup-key" } : {}, stdout: { write } },
			});
		},
	};
}

describe("copyable SDK example consumer", () => {
	it("type-checks the example against current SDK source and rejects a nonexistent method", () => {
		const invalid = "sdk-example-invalid-consumer.mts";
		const diagnostics = typeDiagnostics({
			"sdk-example-consumer.mts": SDK_EXAMPLE,
			[invalid]: SDK_EXAMPLE.replace("run.result()", "run.nonexistentResult()"),
		});
		// One shared program reads the real SDK once; only the deliberate mutation fails.
		expect(diagnostics).toEqual([{
			file: resolve(process.cwd(), invalid),
			message: "Property 'nonexistentResult' does not exist on type 'RunStream'.",
		}]);
	}, 60_000);

	it.each([false, true])("configures only the selected provider lanes, streams text, checks completion, and cleans up (backup %s)", async (backup) => {
		const example = exampleFixture({ backup });
		await example.execute();
		expect(example.createMux).toHaveBeenCalledWith({ sandboxes: { primary: "daytona", backups: backup ? ["e2b"] : [] } }, { selection: null });
		expect(example.create).toHaveBeenCalledWith({ agent: "claude-code", sandbox: "auto", name: "workspace-check" });
		expect(example.worker.run).toHaveBeenCalledWith("List the files in the current directory.");
		expect(example.write).toHaveBeenCalledExactlyOnceWith("README.md\n");
		expect(example.result).toHaveBeenCalledOnce();
		expect(example.worker.destroy).toHaveBeenCalledOnce();
	});

	it.each([{ exitCode: 1 }, { truncated: true }])("reports an unsuccessful result and still destroys the demo workspace (%j)", async (failure) => {
		const example = exampleFixture(failure);
		await expect(example.execute()).rejects.toThrow("Agent run failed or was interrupted");
		expect(example.worker.destroy).toHaveBeenCalledOnce();
	});

	it("cleans up if consuming the event stream throws", async () => {
		const example = exampleFixture({ streamError: true });
		await expect(example.execute()).rejects.toThrow("Fixture stream interrupted");
		expect(example.worker.destroy).toHaveBeenCalledOnce();
	});

	it("installs the provider SDK packages declared by the current package", () => {
		const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "../package.json"), "utf8"));
		for (const provider of ["@daytona/sdk", "e2b"]) {
			expect(INSTALL_CODE.split(" ")).toContain(provider);
			expect(pkg.peerDependencies[provider]).toBeDefined();
			expect(pkg.peerDependenciesMeta[provider].optional).toBe(true);
		}
	});
});
