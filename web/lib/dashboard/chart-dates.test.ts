import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const compiled = ts.transpileModule(readFileSync(resolve(process.cwd(), "components/dashboard/DashboardBarChart.tsx"), "utf8"), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

describe("calendar-date chart buckets (actual component formatter)", () => {
	it.each(["America/Los_Angeles", "UTC", "Asia/Kolkata"])("preserves bucket dates in %s without changing timestamp semantics", (timezone) => {
		const script = `
			const mod = { exports: {} };
			require('node:vm').runInNewContext(${JSON.stringify(compiled)}, {
				module: mod, exports: mod.exports,
				require: (id) => id === 'react' ? { memo: (component) => component } : {},
			});
			const timestamp = '2026-09-09T00:30:00Z';
			process.stdout.write(JSON.stringify({
				dates: ['2026-09-09', '2026-01-01', '2024-02-29'].map(mod.exports.formatDayShort),
				timestamp: mod.exports.formatDayShort(timestamp),
				expectedTimestamp: new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
			}));
		`;
		const result = JSON.parse(execFileSync(process.execPath, ["-e", script], { env: { ...process.env, TZ: timezone }, encoding: "utf8", timeout: 10_000 }));
		expect(result.dates).toEqual(["Sep 9", "Jan 1", "Feb 29"]);
		expect(result.timestamp).toBe(result.expectedTimestamp);
	});
});
