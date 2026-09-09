import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PROVIDER_KINDS } from "@/lib/user-config/schema";
import { HARNESS } from "@/lib/platform/harness";
import { FAQ, SITE } from "./config";
import { buildRootJsonLd } from "./json-ld";

describe("active provider claims for visible FAQ and crawlers", () => {
	it("includes every active provider in the actual metadata and generated JSON-LD", () => {
		const graph = buildRootJsonLd();
		const product = graph["@graph"].find((node) => node["@type"] === "SoftwareApplication");
		const faq = graph["@graph"].find((node) => node["@type"] === "FAQPage");
		expect(product).toBeDefined();
		expect(faq).toBeDefined();
		const providerAnswer = FAQ.find((entry) => entry.question === "Which providers can host the machine?")?.answer;
		for (const kind of PROVIDER_KINDS) {
			for (const value of [SITE.longDescription, JSON.stringify(product?.featureList), providerAnswer]) {
				expect(value?.toLowerCase()).toMatch(new RegExp(`\\b${kind}\\b`));
			}
		}
		for (const value of [JSON.stringify(SITE), JSON.stringify(FAQ), JSON.stringify(graph)]) {
			expect(value).not.toMatch(/Dedalus|\/home\/machine/);
		}
		expect(providerAnswer).toContain("retains files but restarts processes");
		expect(providerAnswer).toContain("Historical benchmark results do not establish Daytona performance");
	});

	it("keeps the served crawler guide on the active roster without borrowing retired proof", () => {
		const guide = readFileSync(resolve(process.cwd(), "public/llms.txt"), "utf8");
		const section = guide.split("## Supported sandbox providers")[1]?.split("## Harness and registry facts")[0];
		expect(section).toBeDefined();
		for (const kind of PROVIDER_KINDS) expect(section?.toLowerCase()).toMatch(new RegExp(`\\b${kind}\\b`));
		expect(guide).not.toMatch(/Dedalus|getOrCreate/);
		expect(section).toContain("Processes restart after stopping");
		expect(section).toContain("not Daytona measurements");
		expect(section).toContain("no verified compute rate or inherited timing");
		expect(section).toContain("/home/daytona");
	});

	it("derives crawler catalog count expectations from the same registry used by the dashboard", () => {
		const guide = readFileSync(resolve(process.cwd(), "public/llms.txt"), "utf8");
		const section = guide.split("## Harness and registry facts")[1]?.split("## SDK")[0];
		expect(section).toBeDefined();
		for (const [count, label] of [
			[HARNESS.skillCount, "SKILL.md skills"],
			[HARNESS.serviceRouteCount, "service lanes"],
			[HARNESS.mcpServerCount, "MCP servers"],
			[`${HARNESS.cliCount}+`, "CLIs"],
		] as const) {
			expect(section).toContain(`**${count}** ${label}`);
		}
	});
});
