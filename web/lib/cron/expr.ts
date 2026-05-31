/**
 * Tiny, dependency-free cron expression engine (UTC).
 *
 * Supports standard 5-field expressions `minute hour day-of-month month
 * day-of-week` with `*`, lists (`a,b`), ranges (`a-b`), and steps (`*​/n`,
 * `a-b/n`). Day-of-week accepts `0-7` (0 and 7 = Sunday) plus the short
 * names `sun..sat`; months accept `1-12` plus `jan..dec`. A handful of
 * `every N{m,h,d}` shorthands normalize to a 5-field expression.
 *
 * The scheduler ticks on a fixed cadence and asks `cronIsDueSince` whether
 * any scheduled minute elapsed since the last run — so it does not depend
 * on the tick landing exactly on a cron's minute boundary.
 *
 * Kept pure (no Date.now, no IO) so it is trivially unit-testable.
 */

const MINUTE_MS = 60_000;
const DEFAULT_LOOKBACK_MS = 60 * MINUTE_MS;

const DOW_NAMES: Record<string, number> = {
	sun: 0,
	mon: 1,
	tue: 2,
	wed: 3,
	thu: 4,
	fri: 5,
	sat: 6,
};

const MONTH_NAMES: Record<string, number> = {
	jan: 1,
	feb: 2,
	mar: 3,
	apr: 4,
	may: 5,
	jun: 6,
	jul: 7,
	aug: 8,
	sep: 9,
	oct: 10,
	nov: 11,
	dec: 12,
};

/**
 * Expand `every N{m,h,d}` shorthands into a 5-field expression, and trim /
 * lowercase. A real 5-field expression passes through unchanged.
 */
export function normalizeSchedule(input: string): string {
	const raw = input.trim().toLowerCase();
	if (!raw) return raw;

	const named: Record<string, string> = {
		hourly: "0 * * * *",
		daily: "0 0 * * *",
		weekly: "0 0 * * 0",
		monthly: "0 0 1 * *",
	};
	if (named[raw]) return named[raw];

	const every = raw.match(/^every\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/);
	if (every) {
		const n = Math.max(1, Number.parseInt(every[1], 10));
		const unit = every[2][0];
		if (unit === "m") return `*/${Math.min(n, 59)} * * * *`;
		if (unit === "h") return n === 1 ? "0 * * * *" : `0 */${Math.min(n, 23)} * * *`;
		return n === 1 ? "0 0 * * *" : `0 0 */${Math.min(n, 31)} * *`;
	}

	return raw;
}

function parseToken(
	token: string,
	min: number,
	max: number,
	names: Record<string, number>,
	out: Set<number>,
): boolean {
	let step = 1;
	let body = token;
	const slash = token.indexOf("/");
	if (slash >= 0) {
		body = token.slice(0, slash);
		step = Number.parseInt(token.slice(slash + 1), 10);
		if (!Number.isFinite(step) || step <= 0) return false;
	}

	let lo = min;
	let hi = max;
	if (body === "*" || body === "") {
		// full range
	} else if (body.includes("-")) {
		const [a, b] = body.split("-");
		const av = resolveValue(a, names);
		const bv = resolveValue(b, names);
		if (av === null || bv === null) return false;
		lo = av;
		hi = bv;
	} else {
		const v = resolveValue(body, names);
		if (v === null) return false;
		lo = v;
		hi = slash >= 0 ? max : v; // `a/n` means from a stepping by n
	}

	if (lo > hi) return false;
	for (let i = lo; i <= hi; i += step) {
		if (i >= min && i <= max) out.add(i);
	}
	return true;
}

function resolveValue(raw: string, names: Record<string, number>): number | null {
	const t = raw.trim();
	if (t in names) return names[t];
	const n = Number.parseInt(t, 10);
	return Number.isFinite(n) ? n : null;
}

function parseField(
	field: string,
	min: number,
	max: number,
	names: Record<string, number> = {},
): Set<number> | null {
	const out = new Set<number>();
	for (const token of field.split(",")) {
		if (!parseToken(token.trim(), min, max, names, out)) return null;
	}
	return out;
}

type ParsedCron = {
	minute: Set<number>;
	hour: Set<number>;
	dom: Set<number>;
	month: Set<number>;
	dow: Set<number>;
	domRestricted: boolean;
	dowRestricted: boolean;
};

/** Parse a (possibly shorthand) schedule into matcher sets, or null if invalid. */
export function parseSchedule(input: string): ParsedCron | null {
	const fields = normalizeSchedule(input).split(/\s+/).filter(Boolean);
	if (fields.length !== 5) return null;
	const [fMin, fHour, fDom, fMonth, fDow] = fields;

	const minute = parseField(fMin, 0, 59);
	const hour = parseField(fHour, 0, 23);
	const dom = parseField(fDom, 1, 31);
	const month = parseField(fMonth, 1, 12, MONTH_NAMES);
	const dowRaw = parseField(fDow, 0, 7, DOW_NAMES);
	if (!minute || !hour || !dom || !month || !dowRaw) return null;

	// Normalize day-of-week 7 -> 0 (both are Sunday).
	const dow = new Set<number>();
	for (const d of dowRaw) dow.add(d === 7 ? 0 : d);

	return {
		minute,
		hour,
		dom,
		month,
		dow,
		domRestricted: fDom !== "*",
		dowRestricted: fDow !== "*",
	};
}

export function isValidSchedule(input: string): boolean {
	return parseSchedule(input) !== null;
}

/** Whether `date` (evaluated in UTC) satisfies the cron expression. */
export function cronMatchesMinute(input: string, date: Date): boolean {
	const p = parseSchedule(input);
	if (!p) return false;
	if (!p.minute.has(date.getUTCMinutes())) return false;
	if (!p.hour.has(date.getUTCHours())) return false;
	if (!p.month.has(date.getUTCMonth() + 1)) return false;

	const domMatch = p.dom.has(date.getUTCDate());
	const dowMatch = p.dow.has(date.getUTCDay());
	// Standard cron quirk: when both DOM and DOW are restricted, match if
	// EITHER matches; otherwise only the restricted field(s) gate the day.
	let dayOk: boolean;
	if (p.domRestricted && p.dowRestricted) dayOk = domMatch || dowMatch;
	else if (p.domRestricted) dayOk = domMatch;
	else if (p.dowRestricted) dayOk = dowMatch;
	else dayOk = true;

	return dayOk;
}

/**
 * Whether a scheduled minute elapsed in `(lastRunAtMs, nowMs]`. Walks at most
 * `lookbackMs` worth of minute boundaries so a sparse tick still catches a
 * due cron, without re-firing minutes at or before the last run.
 */
export function cronIsDueSince(
	input: string,
	lastRunAtMs: number | null,
	nowMs: number,
	lookbackMs: number = DEFAULT_LOOKBACK_MS,
): boolean {
	if (!isValidSchedule(input)) return false;
	const nowFloor = Math.floor(nowMs / MINUTE_MS) * MINUTE_MS;
	const earliest = nowFloor - lookbackMs;
	let start =
		lastRunAtMs != null
			? Math.floor(lastRunAtMs / MINUTE_MS) * MINUTE_MS + MINUTE_MS
			: earliest;
	if (start < earliest) start = earliest;

	for (let t = start; t <= nowFloor; t += MINUTE_MS) {
		if (lastRunAtMs != null && t <= lastRunAtMs) continue;
		if (cronMatchesMinute(input, new Date(t))) return true;
	}
	return false;
}

/** Best-effort human label for the schedule. Falls back to the raw expr. */
export function describeSchedule(input: string): string {
	const norm = normalizeSchedule(input);
	const fields = norm.split(/\s+/);
	if (fields.length !== 5) return input.trim();
	const [m, h, dom, mon, dow] = fields;

	const everyMin = m.match(/^\*\/(\d+)$/);
	if (everyMin && h === "*" && dom === "*" && mon === "*" && dow === "*") {
		return `every ${everyMin[1]} min`;
	}
	if (m === "0" && h === "*" && dom === "*" && mon === "*" && dow === "*") {
		return "hourly";
	}
	const everyHour = h.match(/^\*\/(\d+)$/);
	if (m === "0" && everyHour && dom === "*" && mon === "*" && dow === "*") {
		return `every ${everyHour[1]}h`;
	}
	if (/^\d+$/.test(m) && /^\d+$/.test(h) && dom === "*" && mon === "*") {
		const time = `${h.padStart(2, "0")}:${m.padStart(2, "0")} UTC`;
		if (dow === "*") return `daily at ${time}`;
		return `weekly (${dow}) at ${time}`;
	}
	return norm;
}
