import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Pool } from "@/lib/dashboard/pool";
import { listPresets } from "@/lib/dashboard/presets";
import {
	BAREBONES_MEMORY_BUNDLE_ID,
	DEFAULT_MEMORY_BUNDLE_ID,
	DEFAULT_USER_CONFIG,
	PRESET_MEMORY_PREFIX,
} from "@/lib/user-config/schema";

import { listBundles, newBundle, resolveBundle, seededBundles } from "./bundle";
import { bundleToPrompt } from "./export";
import { bundleFromPaste } from "./import";
import { bundleInstallCommand, combinedDoc } from "./install";

const docs = { soul: "SOUL_X", agentDocs: "RULE_X", memory: "MEM_X", user: "USER_X" };

// A small imported pool so wildcard abilities resolve to something.
const pool: Pool = {
	skills: [
		{
			slug: "deepsec",
			name: "deepsec",
			description: "security scan",
			version: "",
			category: "review",
			tags: [],
			related: [],
			bytes: 0,
		},
	],
	mcps: [{ name: "vercel", transport: "http", source: "vercel", tools: [] }],
};

describe("bundleToPrompt", () => {
	it("includes all four docs and skips the abilities section when empty", () => {
		const b = newBundle({ name: "T", docs, skillIds: [], toolIds: [], mcpServerIds: [] });
		const out = bundleToPrompt(b, pool);
		expect(out).toContain("# T");
		expect(out).toContain("SOUL_X");
		expect(out).toContain("RULE_X");
		expect(out).toContain("MEM_X");
		expect(out).toContain("USER_X");
		expect(out).not.toContain("## Abilities");
	});

	it("renders an abilities section for a wildcard bundle over the pool", () => {
		const b = newBundle({ name: "W", docs: { soul: "S" } }); // defaults to all abilities
		const out = bundleToPrompt(b, pool);
		expect(out).toContain("## Abilities");
		expect(out).toContain("### Skills");
		expect(out).toContain("deepsec");
	});

	it("a wildcard bundle over an empty pool has no skills/mcps section", () => {
		const b = newBundle({ name: "E", docs: { soul: "S" }, toolIds: [] });
		const out = bundleToPrompt(b, { skills: [], mcps: [] });
		expect(out).not.toContain("### Skills");
		expect(out).not.toContain("### MCP servers");
	});

	it("omits empty docs", () => {
		const b = newBundle({ name: "P", docs: { agentDocs: "only rules" }, skillIds: [], toolIds: [], mcpServerIds: [] });
		const out = bundleToPrompt(b, pool);
		expect(out).toContain("only rules");
		expect(out).not.toContain("## Persona & voice");
	});
});

describe("bundleFromPaste", () => {
	it("puts an unstructured blob into agentDocs", () => {
		const b = bundleFromPaste("just some rules and instructions", "My setup");
		expect(b.source).toBe("imported");
		expect(b.name).toBe("My setup");
		expect(b.docs.agentDocs).toBe("just some rules and instructions");
		expect(b.docs.soul).toBe("");
		expect(b.docs.memory).toBe("");
	});

	it("splits when section headers are present", () => {
		const b = bundleFromPaste("# SOUL\nbe terse\n# MEMORY\nremember the repo path");
		expect(b.docs.soul).toContain("be terse");
		expect(b.docs.memory).toContain("remember the repo path");
	});

	it("defaults the name when none given", () => {
		expect(bundleFromPaste("x").name).toBe("Imported memory");
	});
});

describe("bundleInstallCommand", () => {
	it.each(["hermes", "claude-code", "codex", "openclaw"] as const)("executes the %s canonical and derived document contract", (agent) => {
		const root = realpathSync(mkdtempSync(join(tmpdir(), "am-memory-contract-")));
		try {
			const b = newBundle({ name: "I", docs });
			const result = spawnSync("/bin/bash", ["-c", bundleInstallCommand(b, agent)], { env: { ...process.env, HOME: root }, encoding: "utf8" });
			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toContain("AM_MEMORY_INSTALLED");
			const files = { "SOUL.md": docs.soul, "AGENTS.md": docs.agentDocs, "MEMORY.md": docs.memory, "USER.md": docs.user };
			for (const [name, content] of Object.entries(files)) {
				expect(readFileSync(join(root, ".agent-machines", name), "utf8")).toBe(content);
				if (agent === "openclaw") expect(readFileSync(join(root, ".openclaw/workspace", name), "utf8")).toBe(content);
			}
			if (agent === "claude-code" || agent === "codex") {
				const entry = agent === "claude-code" ? "CLAUDE.md" : "AGENTS.md";
				const directory = agent === "claude-code" ? ".claude" : ".codex";
				expect(readFileSync(join(root, entry), "utf8")).toBe(combinedDoc(b));
				expect(readFileSync(join(root, directory, entry), "utf8")).toBe(combinedDoc(b));
			} else {
				expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
				expect(existsSync(join(root, ".codex"))).toBe(false);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("passes shell metacharacters as document data, never commands", () => {
		const root = realpathSync(mkdtempSync(join(tmpdir(), "am-memory-quoting-")));
		try {
			const text = `quotes '\"; $(touch ${root}/injected) \`echo NO\`\nUnicode: 你好`;
			const command = bundleInstallCommand(newBundle({ name: "B", docs: { ...docs, soul: text } }), "hermes");
			expect(command).not.toContain(text);
			const result = spawnSync("/bin/bash", ["-c", command], { env: { ...process.env, HOME: root }, encoding: "utf8" });
			expect(result.status, result.stderr).toBe(0);
			expect(readFileSync(join(root, ".agent-machines/SOUL.md"), "utf8")).toBe(text);
			expect(existsSync(join(root, "injected"))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("combinedDoc", () => {
	it("joins non-empty docs under headers", () => {
		const out = combinedDoc(newBundle({ name: "K", docs }));
		expect(out).toContain("# Persona & voice");
		expect(out).toContain("SOUL_X");
		expect(out).toContain("# Working memory");
	});
});

describe("seeded default memories", () => {
	it("seeds the two defaults + one memory per curated preset", () => {
		const seeded = seededBundles();
		const ids = seeded.map((b) => b.id);
		expect(ids).toContain(DEFAULT_MEMORY_BUNDLE_ID);
		expect(ids).toContain(BAREBONES_MEMORY_BUNDLE_ID);
		for (const preset of listPresets()) {
			expect(ids).toContain(`${PRESET_MEMORY_PREFIX}${preset.id}`);
		}
		expect(seeded.length).toBe(2 + listPresets().length);
	});

	it("the default is the full ability set; barebones is a focused few", () => {
		const def = resolveBundle(DEFAULT_USER_CONFIG, DEFAULT_MEMORY_BUNDLE_ID);
		expect(def?.skillIds).toEqual(["*"]);
		expect(def?.mcpServerIds).toEqual(["*"]);

		const bare = resolveBundle(DEFAULT_USER_CONFIG, BAREBONES_MEMORY_BUNDLE_ID);
		expect(bare?.skillIds.length).toBeGreaterThan(0);
		expect(bare?.skillIds).not.toContain("*");
		expect(bare?.docs.soul.length).toBeGreaterThan(0);
	});

	it("resolves a preset memory by its synthesized id", () => {
		const preset = listPresets()[0];
		const mem = resolveBundle(DEFAULT_USER_CONFIG, `${PRESET_MEMORY_PREFIX}${preset.id}`);
		expect(mem?.name).toBe(preset.name);
		expect(mem?.skillIds).toEqual(preset.skillIds);
	});

	it("a stored bundle overrides a seeded one of the same id", () => {
		const override = newBundle({ name: "My default", docs: { soul: "X" } });
		const config = {
			...DEFAULT_USER_CONFIG,
			memoryBundles: [{ ...override, id: DEFAULT_MEMORY_BUNDLE_ID }],
		};
		const bundles = listBundles(config);
		const defaults = bundles.filter((b) => b.id === DEFAULT_MEMORY_BUNDLE_ID);
		expect(defaults.length).toBe(1);
		expect(defaults[0].name).toBe("My default");
	});
});
