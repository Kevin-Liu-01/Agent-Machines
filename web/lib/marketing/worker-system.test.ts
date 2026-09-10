import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { WorkerSystemThesis } from "@/components/WorkerSystemThesis";
import { CAPABILITY_GROUPS, CapabilityAtlas } from "@/components/CapabilityAtlas";
import { ENGINE_GEARS } from "@/lib/marketing/worker-gears";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

describe("Worker system explanation", () => {
	const render = () => renderToStaticMarkup(React.createElement(WorkerSystemThesis));

	it("keeps the architecture readable as HTML rather than scaling text inside an SVG", () => {
		const html = render();
		expect(html).toContain('aria-labelledby="worker-system-heading"');
		expect(html).toContain('id="worker-system-heading"');
		expect(html).not.toContain("foreignObject");
		for (const trait of ["Identity", "Memory", "Schedules", "Files", "History", "Evidence"]) {
			expect(html).toContain(trait);
		}
	});

	it("labels the supported runtimes and providers instead of relying on logos alone", () => {
		const html = render();
		for (const label of ["Claude Code", "Codex", "Hermes", "OpenClaw", "Daytona", "E2B", "Sprites", "Vercel"]) {
			expect(html).toMatch(new RegExp(`>${label}</li>`));
		}
		expect(html).not.toMatch(/Dedalus/i);
	});

	it("distinguishes saved Worker state from live process migration", () => {
		const html = render();
		expect(html).toContain("each provider supplies its own capabilities");
		expect(html).toContain("not live process memory");
		expect(html).not.toMatch(/work verified|verified output|zero.downtime/i);
	});

	it("keeps the specialist and architecture actions reachable", () => {
		const html = render();
		expect(html).toContain('href="/agents"');
		expect(html).toContain('href="/docs"');
		expect(html).toContain("Choose a Worker");
		expect(html).toContain("Read the architecture");
	});

	it("connects four layers through varied-ratio clockwork with synchronized, pausable gear rings", () => {
		const html = render();
		expect(html.match(/data-worker-gear="satellite"/g)).toHaveLength(4);
		expect(html.match(/data-worker-gear="core"/g)).toHaveLength(1);
		expect(html.match(/data-worker-gear="idler"/g)).toHaveLength(ENGINE_GEARS.filter(gear => gear.kind === "idler").length);
		expect(html).toContain("motion-safe:animate-spin");
		const periods = new Set(ENGINE_GEARS.map(gear => gear.period));
		expect(periods.size).toBeGreaterThanOrEqual(5);
		for (const period of periods) {
			expect(html.split(`animation-duration:${period}s;`)).toHaveLength(ENGINE_GEARS.filter(gear => gear.period === period).length + 1);
		}
		expect(html).toContain("group-data-[gear-motion=paused]/engine:[animation-play-state:paused]");
		expect(html).toContain('data-gear-motion="paused"');
		expect(html).toContain('type="checkbox"');
		expect(html).toContain("Animate engine");
		expect(html).toContain("Reduced motion");
		expect(html).toContain('aria-label="Interlocking Worker engine"');
	});
});

describe("capability section presentation", () => {
	it("renders all 24 linked capabilities in six named sections", () => {
		const html = renderToStaticMarkup(React.createElement(CapabilityAtlas));
		expect(html.match(/data-capability=/g)).toHaveLength(24);
		for (const group of CAPABILITY_GROUPS) {
			expect(html).toContain(`aria-labelledby="capability-${group.id}"`);
			expect(html).toContain(`id="capability-${group.id}"`);
		}
	});

	it("does not present illustrative diagrams as live telemetry", () => {
		const html = renderToStaticMarkup(React.createElement(CapabilityAtlas));
		expect(html.match(/Illustration/g)).toHaveLength(6);
	});

	it("keeps migration and credential limitations visible with the related capability", () => {
		const claims = CAPABILITY_GROUPS.flatMap((group) => group.capabilities);
		const migration = claims.find((claim) => claim.dashboardId === "migration")!;
		expect(`${migration.description} ${migration.meta}`).toMatch(/not a transfer of running processes or RAM/i);
		const credentials = claims.find((claim) => claim.title === "Scoped credentials")!;
		expect(credentials.description).toContain("credential presence");
		expect(credentials.meta).toContain("not vendor credential validation");
	});
});
