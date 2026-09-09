import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import memoryDefault from "@/data/memory-default.json";

const knowledge = (name: string) => readFileSync(resolve(process.cwd(), "../knowledge", name), "utf8").trim();

describe("active Worker knowledge seeds", () => {
	it.each(["AGENTS.md", "MEMORY.md", "VISION.md"])("teaches current providers and provider-aware paths in %s", (name) => {
		const text = knowledge(name);
		for (const provider of ["Daytona", "E2B", "Sprites", "Vercel"]) expect(text).toContain(provider);
		expect(text).not.toContain("Dedalus");
		expect(text).not.toContain("/home/machine");
		expect(text).toContain("$HOME");
	});
	it.each(["/home/daytona", "/home/user", "/home/sprite", "/vercel/sandbox"])("documents %s as a provider-specific home, not the universal checkout", (home) => {
		expect(knowledge("MEMORY.md")).toContain(home);
		expect(knowledge("VISION.md")).toContain('"$HOME/agent-machines"');
	});
	it.each([['agentDocs', 'AGENTS.md'], ['memory', 'MEMORY.md'], ['soul', 'SOUL.md'], ['user', 'USER.md']] as const)("keeps generated %s identical to canonical %s", (field, name) => {
		expect(memoryDefault[field]).toBe(knowledge(name));
	});
});
