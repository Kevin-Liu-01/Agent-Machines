import { describe, expect, it } from "vitest";

import { parseRunLog } from "./run-log";

describe("parseRunLog", () => {
	it("parses the embedded run-time arm when present", () => {
		const line = JSON.stringify({
			id: "cron-1",
			startedAt: "2026-06-15T00:00:00Z",
			finishedAt: "2026-06-15T00:00:05Z",
			exitCode: 0,
			arm: {
				runtime: "hermes",
				substrate: "e2b",
				model: "anthropic/claude-sonnet-4-6",
				router: "dedalus-default",
			},
		});
		const [e] = parseRunLog(line);
		expect(e.exitCode).toBe(0);
		expect(e.runtime).toBe("hermes");
		expect(e.substrate).toBe("e2b");
		expect(e.model).toBe("anthropic/claude-sonnet-4-6");
		expect(e.router).toBe("dedalus-default");
	});

	it("represents a null router (native/default) distinctly from absent", () => {
		const line = JSON.stringify({
			id: "c2",
			startedAt: "t",
			finishedAt: "t",
			exitCode: 0,
			arm: { runtime: "codex", substrate: "e2b", model: "gpt-5.1", router: null },
		});
		const [e] = parseRunLog(line);
		expect(e.runtime).toBe("codex");
		expect(e.router).toBeNull();
	});

	it("leaves arm fields undefined on legacy lines (no arm object)", () => {
		const line = '{"id":"c3","startedAt":"t","finishedAt":"t","exitCode":1}';
		const [e] = parseRunLog(line);
		expect(e.exitCode).toBe(1);
		expect(e.runtime).toBeUndefined();
		expect(e.router).toBeUndefined();
	});

	it("treats an empty arm object (decode-failure fallback) as full fallback", () => {
		const line = '{"id":"c4","startedAt":"t","finishedAt":"t","exitCode":0,"arm":{}}';
		const [e] = parseRunLog(line);
		expect(e.runtime).toBeUndefined();
		expect(e.router).toBeUndefined();
	});

	it("round-trips a model id with quotes/backslashes (JSON-safe embedding)", () => {
		const weird = 'weird"/\\model';
		const line = JSON.stringify({
			id: "c5",
			startedAt: "t",
			finishedAt: "t",
			exitCode: 0,
			arm: { runtime: "hermes", substrate: "e2b", model: weird, router: null },
		});
		const [e] = parseRunLog(line);
		expect(e.model).toBe(weird);
	});

	it("skips malformed and non-object lines", () => {
		const out = parseRunLog(
			'not json\n{"id":"c6","startedAt":"t","finishedAt":"t","exitCode":0}\n{bad',
		);
		expect(out).toHaveLength(1);
		expect(out[0].id).toBe("c6");
	});

	it("drops entries missing a required field", () => {
		const out = parseRunLog('{"id":"x","startedAt":"t","exitCode":0}'); // no finishedAt
		expect(out).toHaveLength(0);
	});
});
