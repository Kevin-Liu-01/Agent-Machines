import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AGENT_TEMPLATES, NAV_AGENT_TEMPLATES, PRODUCT_FEATURES, RESOURCE_PAGES } from "./public-site";

describe("active public provider catalog", () => {
	it("lists Daytona rather than a retired provider in every product and template surface", () => {
		expect(AGENT_TEMPLATES.length).toBeGreaterThan(0);
		for (const template of AGENT_TEMPLATES) {
			expect(template.providerLane).toContain("Daytona");
			expect(template.providerLane).not.toMatch(/Dedalus/i);
		}
		expect(JSON.stringify({ PRODUCT_FEATURES, AGENT_TEMPLATES, NAV_AGENT_TEMPLATES, RESOURCE_PAGES })).not.toMatch(/Dedalus/i);
		const lanes = PRODUCT_FEATURES.find((feature) => feature.slug === "persistent-machines")!.metrics.find((metric) => metric.label === "Provider lanes")!;
		expect(lanes.value).toBe("4");
		for (const provider of ["E2B", "Sprites", "Daytona", "Vercel"]) expect(lanes.detail).toContain(provider);
	});
	it("describes filesystem stop/start without promising retained Daytona processes", () => {
		const state = PRODUCT_FEATURES.find((feature) => feature.slug === "snapshots-volumes")!;
		expect(state.longDescription).toContain("Daytona stop/start preserves files rather than running processes");
		const terminal = readFileSync(resolve(process.cwd(), "docs/sandbox-terminal-gateway.md"), "utf8");
		expect(terminal).toContain("getSessionCommandLogs()");
		expect(terminal).toContain("native SDK PTY");
		expect(terminal).toContain("Dedalus providers and model gateways are not supported");
		expect(terminal).not.toMatch(/\| \*\*Dedalus\*\*|fallback \(Dedalus\)|Vercel Sandbox and Dedalus retain/);
	});
});
