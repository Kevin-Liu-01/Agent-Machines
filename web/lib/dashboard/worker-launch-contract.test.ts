import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("worker launch startup contract", () => {
	it("reuses server-loaded dashboard config without a client settings waterfall", () => {
		const launchpad = readFileSync(
			resolve(process.cwd(), "components/dashboard/WorkerLaunchpad.tsx"),
			"utf8",
		);
		const shell = readFileSync(
			resolve(process.cwd(), "components/dashboard/DashboardShell.tsx"),
			"utf8",
		);

		expect(launchpad).toContain("useDashboardConfig()");
		expect(launchpad).not.toContain("/api/dashboard/admin/settings");
		expect(shell).toContain("<DashboardConfigProvider config={config}>");
	});
});
