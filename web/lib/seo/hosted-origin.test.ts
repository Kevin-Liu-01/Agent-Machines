import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { SITE } from "./config";

const canonicalOrigin = "https://www.agent-machines.dev";

describe("canonical hosted origin", () => {
	it("publishes the destination host in metadata, robots, and every sitemap URL", () => {
		expect(SITE.url).toBe(canonicalOrigin);
		expect(robots().host).toBe(canonicalOrigin);
		expect(robots().sitemap).toBe(`${canonicalOrigin}/sitemap.xml`);
		expect(sitemap().length).toBeGreaterThan(0);
		for (const entry of sitemap()) expect(new URL(entry.url).origin).toBe(canonicalOrigin);
	});

	it("sends copied SDK configuration directly to the API without a cross-origin redirect", () => {
		const settings = readFileSync(resolve(process.cwd(), "components/dashboard/SettingsPanel.tsx"), "utf8");
		const guide = readFileSync(resolve(process.cwd(), "public/llms.txt"), "utf8");
		expect(settings.match(/export AGENT_MACHINES_URL=(\S+)/)?.[1]).toBe(canonicalOrigin);
		expect(guide.match(/baseUrl:\s*"([^"]+)"/)?.[1]).toBe(canonicalOrigin);
		expect(settings).not.toMatch(/AGENT_MACHINES_URL=https:\/\/(?:www\.)?agent-machines\.com/);
		expect(guide).not.toContain("agent-machines.com");
	});
});
