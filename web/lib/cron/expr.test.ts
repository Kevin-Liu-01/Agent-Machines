import { describe, expect, it } from "vitest";

import {
	cronIsDueSince,
	cronMatchesMinute,
	describeSchedule,
	isValidSchedule,
	normalizeSchedule,
} from "./expr";

const minute = (iso: string) => new Date(iso);
const ms = (iso: string) => Date.parse(iso);

describe("normalizeSchedule", () => {
	it("expands every-N shorthands", () => {
		expect(normalizeSchedule("every 5m")).toBe("*/5 * * * *");
		expect(normalizeSchedule("every 15 minutes")).toBe("*/15 * * * *");
		expect(normalizeSchedule("every 1h")).toBe("0 * * * *");
		expect(normalizeSchedule("every 2h")).toBe("0 */2 * * *");
		expect(normalizeSchedule("every 1d")).toBe("0 0 * * *");
	});

	it("expands named shorthands", () => {
		expect(normalizeSchedule("hourly")).toBe("0 * * * *");
		expect(normalizeSchedule("daily")).toBe("0 0 * * *");
		expect(normalizeSchedule("weekly")).toBe("0 0 * * 0");
	});

	it("passes a real 5-field expression through", () => {
		expect(normalizeSchedule("0 9 * * *")).toBe("0 9 * * *");
	});
});

describe("isValidSchedule", () => {
	it("accepts valid expressions", () => {
		expect(isValidSchedule("0 9 * * *")).toBe(true);
		expect(isValidSchedule("*/15 * * * *")).toBe(true);
		expect(isValidSchedule("0 4 * * mon")).toBe(true);
		expect(isValidSchedule("every 30m")).toBe(true);
	});

	it("rejects garbage", () => {
		expect(isValidSchedule("not a cron")).toBe(false);
		expect(isValidSchedule("0 9 * *")).toBe(false);
		expect(isValidSchedule("")).toBe(false);
	});
});

describe("cronMatchesMinute", () => {
	it("matches a daily time exactly", () => {
		expect(cronMatchesMinute("0 9 * * *", minute("2026-01-01T09:00:00Z"))).toBe(true);
		expect(cronMatchesMinute("0 9 * * *", minute("2026-01-01T09:01:00Z"))).toBe(false);
		expect(cronMatchesMinute("0 9 * * *", minute("2026-01-01T10:00:00Z"))).toBe(false);
	});

	it("matches step minutes", () => {
		expect(cronMatchesMinute("*/15 * * * *", minute("2026-01-01T12:00:00Z"))).toBe(true);
		expect(cronMatchesMinute("*/15 * * * *", minute("2026-01-01T12:15:00Z"))).toBe(true);
		expect(cronMatchesMinute("*/15 * * * *", minute("2026-01-01T12:07:00Z"))).toBe(false);
	});

	it("matches day-of-week names", () => {
		// 2024-01-01 is a Monday.
		expect(cronMatchesMinute("0 4 * * mon", minute("2024-01-01T04:00:00Z"))).toBe(true);
		expect(cronMatchesMinute("0 4 * * mon", minute("2024-01-02T04:00:00Z"))).toBe(false);
	});

	it("ORs DOM and DOW when both are restricted", () => {
		// day-of-month 1 OR Monday
		expect(cronMatchesMinute("0 0 1 * mon", minute("2024-01-01T00:00:00Z"))).toBe(true); // Mon AND 1st
		expect(cronMatchesMinute("0 0 1 * mon", minute("2024-02-01T00:00:00Z"))).toBe(true); // 1st (Thu)
		expect(cronMatchesMinute("0 0 1 * mon", minute("2024-01-08T00:00:00Z"))).toBe(true); // Monday
		expect(cronMatchesMinute("0 0 1 * mon", minute("2024-01-09T00:00:00Z"))).toBe(false); // neither
	});
});

describe("cronIsDueSince", () => {
	it("fires once the scheduled minute elapses", () => {
		const last = ms("2026-01-01T12:05:00Z");
		expect(cronIsDueSince("*/5 * * * *", last, ms("2026-01-01T12:07:00Z"))).toBe(false);
		expect(cronIsDueSince("*/5 * * * *", last, ms("2026-01-01T12:10:30Z"))).toBe(true);
	});

	it("does not re-fire the same minute as the last run", () => {
		const last = ms("2026-01-01T12:10:00Z");
		expect(cronIsDueSince("*/5 * * * *", last, ms("2026-01-01T12:10:40Z"))).toBe(false);
	});

	it("catches a due minute across a sparse tick window", () => {
		// last ran an hour ago; an hourly cron should be due now.
		const last = ms("2026-01-01T11:00:00Z");
		expect(cronIsDueSince("0 * * * *", last, ms("2026-01-01T12:03:00Z"))).toBe(true);
	});

	it("arms from lookback when never run", () => {
		// A 5-min cron, never run, evaluated a couple minutes after a boundary.
		expect(cronIsDueSince("*/5 * * * *", null, ms("2026-01-01T12:02:00Z"))).toBe(true);
		// A daily 09:00 cron, never run, evaluated mid-afternoon — not within lookback.
		expect(cronIsDueSince("0 9 * * *", null, ms("2026-01-01T15:00:00Z"))).toBe(false);
	});

	it("returns false for invalid expressions", () => {
		expect(cronIsDueSince("nope", null, Date.now())).toBe(false);
	});
});

describe("describeSchedule", () => {
	it("labels common shapes", () => {
		expect(describeSchedule("*/5 * * * *")).toBe("every 5 min");
		expect(describeSchedule("0 * * * *")).toBe("hourly");
		expect(describeSchedule("0 9 * * *")).toBe("daily at 09:00 UTC");
		expect(describeSchedule("every 15m")).toBe("every 15 min");
	});
});
