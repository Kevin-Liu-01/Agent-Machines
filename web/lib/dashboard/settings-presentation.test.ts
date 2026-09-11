import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { SettingsPanel } from "@/components/dashboard/SettingsPanel";
import { QuickstartGuide } from "@/components/dashboard/QuickstartGuide";
import { OnboardingFlow } from "@/components/dashboard/OnboardingFlow";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Brain } from "@/components/ui/icons";
import { listPresets } from "@/lib/dashboard/presets";
import { DEFAULT_USER_CONFIG, toPublicConfig } from "@/lib/user-config/schema";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

describe("calm settings and quickstart presentation", () => {
	it.each([false, true])("keeps one page h1 and a semantic model icon when quickstart is embedded=%s", (embedded) => {
		const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
			embedded ? React.createElement(PageHeader, { title: "Quickstart", kicker: "Setup" }) : null,
			React.createElement(OnboardingFlow, { embedded, initialConfig: toPublicConfig(structuredClone(DEFAULT_USER_CONFIG)), presets: listPresets() }),
		));
		expect([...html.matchAll(/<h1\b/g)]).toHaveLength(1);
		expect(html).toMatch(embedded ? /<h2\b[^>]*data-onboarding-step-heading/ : /<h1\b[^>]*data-onboarding-step-heading/);
		expect(html).toMatch(embedded ? /<h3\b[^>]*>Bring two things<\/h3>/ : /<h2\b[^>]*>Bring two things<\/h2>/);
		const brainPath = renderToStaticMarkup(React.createElement(Brain)).match(/<path\b[^>]*>/)?.[0];
		expect(brainPath).toBeTruthy();
		expect(html).toContain(brainPath);
		expect(html).toContain('data-icon-weight="fill"');
	});

	it("uses real section anchors, account disclosures, and a persistent quickstart link", () => {
		const html = renderToStaticMarkup(React.createElement(SettingsPanel, { initialConfig: toPublicConfig(structuredClone(DEFAULT_USER_CONFIG)) }));
		for (const id of ["compute-credentials", "model-credentials", "workspace-defaults", "developer-access"]) {
			expect(html).toContain(`href="#${id}"`);
			expect(html).toContain(`id="${id}"`);
		}
		expect(html).toContain('href="/dashboard/setup"');
		expect(html).toContain("Open quickstart");
		expect(html).toContain("Defaults for new workspaces");
		expect(html).toContain("These selections save immediately");
		expect(html).toContain("Blank fields preserve existing secrets");
		expect(html).toContain("Keys on file have not necessarily been validated");
		const details = [...html.matchAll(/<details\b([^>]*)>/g)];
		expect(details.length).toBeGreaterThanOrEqual(11);
		expect(details.every(([, attributes]) => !/\bopen\b/.test(attributes))).toBe(true);
		expect(html).not.toContain("checkbox");
	});

	it("keeps all account secret inputs masked and comfortably sized", () => {
		const html = renderToStaticMarkup(React.createElement(SettingsPanel, { initialConfig: toPublicConfig(structuredClone(DEFAULT_USER_CONFIG)) }));
		const secretInputs = [...html.matchAll(/<input\b[^>]*type="password"[^>]*>/g)].map(([input]) => input);
		expect(secretInputs).toHaveLength(11);
		for (const input of secretInputs) {
			expect(input).toContain('value=""');
			expect(input).toContain('autoComplete="off"');
			expect(input).toContain("min-h-11");
			expect(input).toContain("text-base");
		}
	});

	it("shows the real repository CLI entry without inventing login or automatic account-key export", () => {
		const html = renderToStaticMarkup(React.createElement(QuickstartGuide));
		expect(html).toContain("pnpm mux help");
		expect(html).toContain("dashboard keys are not automatically exported");
		expect(html).toContain("without launching compute");
		expect(html).toContain("github.com/Kevin-Liu-01/Agent-Machines#cli");
		const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "../package.json"), "utf8"));
		expect(pkg.scripts.mux).toBe("tsx src/cli.ts mux");
		const dispatcher = readFileSync(resolve(process.cwd(), "../src/cli.ts"), "utf8");
		expect(dispatcher).toContain("mux: (args) => mux(args)");
		expect(html).not.toMatch(/am login|npx agent-machines|free credits|npm install -g/);
	});
});
