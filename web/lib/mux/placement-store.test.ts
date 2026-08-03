/**
 * Tests for the hosted placement store.
 *
 * The fake below is a small Postgres, not a spy: it stores rows, applies `eq`
 * filters, implements INSERT .. ON CONFLICT over the declared conflict target,
 * enforces the two check constraints from the DDL in placement-store.ts, and
 * stamps `updated_at` from its own clock the way the trigger does. That is
 * deliberate -- the guarantees under test are about what the DATABASE ends up
 * holding (one tenant cannot read another's placement, a concurrent insert is
 * not lost, a health write does not drop a machine), and a fake that merely
 * recorded calls could not fail on any of them.
 *
 * Where a call-shape assertion is the guarantee itself (no read before a write,
 * no age filter, no `updated_at` from the client) the log is asserted directly
 * and says so.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SubstrateHealthSnapshot } from "../../../src/mux/health.js";
import type { MachinePlacement, PlacementStore } from "../../../src/mux/state.js";
import type { MuxErrorKind } from "../../../src/mux/types.js";
import { muxErrorKindOf } from "@/lib/providers/mux-facade";

const mocks = vi.hoisted(() => ({ supabaseAdmin: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({ supabaseAdmin: mocks.supabaseAdmin }));

import {
	CONFLICT_TARGET,
	HEALTH_KIND,
	HEALTH_ROW_NAME,
	HostedMuxError,
	PLACEMENTS_MIGRATION,
	PLACEMENTS_TABLE,
	PLACEMENT_KIND,
	READ_COLUMNS,
	SupabasePlacementStore,
	createSupabasePlacementStore,
	type DbError,
	type DbResult,
	type SupabaseLike,
} from "./placement-store";

// ---------------------------------------------------------------------------
// A fake Postgres behind the supabase-js slice
// ---------------------------------------------------------------------------

type Row = {
	tenant_id: string;
	kind: string;
	name: string;
	substrate: string | null;
	sandbox_id: string | null;
	agent: string | null;
	health: unknown;
	updated_at: string;
};

type Logged =
	| { op: "select"; table: string; columns: string; filters: Array<[string, string]> }
	| { op: "upsert"; table: string; row: Record<string, unknown>; onConflict: string }
	| { op: "delete"; table: string; filters: Array<[string, string]> };

/** PostgREST-shaped check-constraint violation. */
function checkViolation(constraint: string): DbError {
	return {
		code: "23514",
		message: `new row for relation "${PLACEMENTS_TABLE}" violates check constraint "${constraint}"`,
		details: null,
	};
}

class FakeDb implements SupabaseLike {
	rows: Row[] = [];
	log: Logged[] = [];
	/** Returned instead of running the next statement, then cleared. */
	nextError: DbError | null = null;
	/** Thrown instead of running the next statement, then cleared. */
	nextThrow: unknown = null;

	/**
	 * Stands in for the `updated_at` trigger: the DATABASE clock, deliberately
	 * far from the test process's `Date.now()` so a client-written timestamp
	 * cannot pass by coincidence. Rendered the way PostgREST renders
	 * timestamptz (microseconds, +00:00) so the store's normalization is
	 * exercised too.
	 */
	private clock = Date.UTC(2026, 7, 2, 12, 0, 0);

	private gate: Promise<void> | null = null;
	private openGate: (() => void) | null = null;

	/** Suspend every statement until `open()`, to interleave two writers. */
	hold(): void {
		this.gate = new Promise<void>((resolve) => {
			this.openGate = resolve;
		});
	}

	open(): void {
		const release = this.openGate;
		this.gate = null;
		this.openGate = null;
		release?.();
	}

	seed(row: Partial<Row> & { tenant_id: string; name: string }): void {
		this.rows.push({
			kind: PLACEMENT_KIND,
			substrate: null,
			sandbox_id: null,
			agent: null,
			health: null,
			updated_at: this.stamp(),
			...row,
		});
	}

	ops(): string[] {
		return this.log.map((entry) => entry.op);
	}

	upserts(): Array<Extract<Logged, { op: "upsert" }>> {
		return this.log.filter((entry) => entry.op === "upsert");
	}

	selects(): Array<Extract<Logged, { op: "select" }>> {
		return this.log.filter((entry) => entry.op === "select");
	}

	deletes(): Array<Extract<Logged, { op: "delete" }>> {
		return this.log.filter((entry) => entry.op === "delete");
	}

	from(table: string) {
		return {
			select: (columns: typeof READ_COLUMNS) => ({
				eq: (column: string, value: string) =>
					this.run({ op: "select", table, columns, filters: [[column, value]] }),
			}),
			upsert: (row: Record<string, unknown>, options: { onConflict: string }) =>
				this.run({ op: "upsert", table, row, onConflict: options.onConflict }),
			delete: () => ({
				eq: (first: string, firstValue: string) => ({
					eq: (second: string, secondValue: string) =>
						this.run({
							op: "delete",
							table,
							filters: [
								[first, firstValue],
								[second, secondValue],
							],
						}),
				}),
			}),
		};
	}

	private stamp(): string {
		this.clock += 1000;
		return new Date(this.clock).toISOString().replace("Z", "000+00:00");
	}

	private async run(entry: Logged): Promise<DbResult> {
		const gate = this.gate;
		if (gate) await gate;
		this.log.push(entry);
		if (this.nextThrow !== null) {
			const thrown = this.nextThrow;
			this.nextThrow = null;
			throw thrown;
		}
		if (this.nextError) {
			const error = this.nextError;
			this.nextError = null;
			return { data: null, error };
		}
		if (entry.table !== PLACEMENTS_TABLE) {
			return { data: null, error: { code: "42P01", message: `relation "${entry.table}" does not exist` } };
		}
		switch (entry.op) {
			case "select":
				return this.select(entry.columns, entry.filters);
			case "upsert":
				return this.upsert(entry.row, entry.onConflict);
			case "delete":
				return this.remove(entry.filters);
		}
	}

	private matches(row: Row, filters: Array<[string, string]>): boolean {
		return filters.every(
			([column, value]) => (row as unknown as Record<string, unknown>)[column] === value,
		);
	}

	private select(columns: string, filters: Array<[string, string]>): DbResult {
		const wanted = columns.split(",").map((column) => column.trim());
		const data = this.rows.filter((row) => this.matches(row, filters)).map((row) => {
			// Project exactly what was asked for: a column the store forgets to
			// select is a column it cannot parse, which must fail the test rather
			// than pass on the fake's generosity.
			const projected: Record<string, unknown> = {};
			for (const column of wanted) {
				projected[column] = (row as unknown as Record<string, unknown>)[column];
			}
			return projected;
		});
		return { data, error: null };
	}

	private upsert(payload: Record<string, unknown>, onConflict: string): DbResult {
		const key = onConflict.split(",").map((column) => column.trim());
		for (const column of key) {
			if (payload[column] === undefined) {
				return {
					data: null,
					error: {
						code: "42703",
						message: `conflict target column ${column} missing from the payload`,
					},
				};
			}
		}
		const existing = this.rows.find((row) =>
			key.every(
				(column) => (row as unknown as Record<string, unknown>)[column] === payload[column],
			),
		);
		const base: Row = existing ?? {
			tenant_id: "",
			kind: "",
			name: "",
			substrate: null,
			sandbox_id: null,
			agent: null,
			health: null,
			updated_at: "",
		};
		// ON CONFLICT DO UPDATE SET <supplied columns>: anything absent from the
		// payload keeps its stored value. This is what makes "saveHealth must not
		// clobber machines" testable rather than assumed.
		const next: Row = { ...base, ...(payload as Partial<Row>), updated_at: this.stamp() };
		const violation = constraintViolation(next);
		if (violation) return { data: null, error: violation };
		if (existing) Object.assign(existing, next);
		else this.rows.push(next);
		return { data: null, error: null };
	}

	private remove(filters: Array<[string, string]>): DbResult {
		this.rows = this.rows.filter((row) => !this.matches(row, filters));
		return { data: null, error: null };
	}
}

/** The two check constraints from the DDL, enforced. */
function constraintViolation(row: Row): DbError | null {
	if (row.kind !== PLACEMENT_KIND && row.kind !== HEALTH_KIND) {
		return checkViolation("mux_placements_kind");
	}
	if (row.kind === PLACEMENT_KIND) {
		const ok =
			row.name !== "" &&
			row.substrate !== null &&
			row.sandbox_id !== null &&
			row.agent !== null &&
			row.health === null;
		return ok ? null : checkViolation("mux_placements_shape");
	}
	const ok =
		row.name === "" &&
		row.health !== null &&
		row.substrate === null &&
		row.sandbox_id === null &&
		row.agent === null;
	return ok ? null : checkViolation("mux_placements_shape");
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const E2B_CLAUDE: MachinePlacement = {
	substrate: "e2b",
	sandboxId: "e2b-sandbox-1",
	agent: "claude-code",
};

const SPRITES_CODEX: MachinePlacement = {
	substrate: "sprites",
	sandboxId: "am-mux-beta",
	agent: "codex",
};

function healthSnapshot(openedAt?: number): SubstrateHealthSnapshot {
	const entry = openedAt === undefined
		? { samples: [{ at: 1, outcome: "ok" as const }] }
		: { samples: [{ at: 1, outcome: "transient" as const }], openedAt };
	return { version: 1, substrates: { e2b: entry } };
}

function store(db: FakeDb, tenantId = "tenant-a"): SupabasePlacementStore {
	return new SupabasePlacementStore({ tenantId, client: db });
}

/** Return the rejection, or fail loudly if the call unexpectedly succeeded. */
async function failureOf(run: () => Promise<unknown>): Promise<unknown> {
	try {
		await run();
	} catch (error) {
		return error;
	}
	throw new Error("expected the store to reject");
}

async function kindOf(run: () => Promise<unknown>): Promise<MuxErrorKind | null> {
	// Through the facade's structural recogniser on purpose: that is how a
	// caller across the package boundary will read this error.
	return muxErrorKindOf(await failureOf(run));
}

beforeEach(() => {
	mocks.supabaseAdmin.mockReset();
	mocks.supabaseAdmin.mockImplementation(() => {
		throw new Error(
			"Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY.",
		);
	});
});

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

describe("SupabasePlacementStore contract", () => {
	it("satisfies the mux PlacementStore interface and declares itself async", () => {
		const db = new FakeDb();
		// Typed as the REAL interface: this line is the compile-time conformance
		// check, so a drift in src/mux/state.ts fails typecheck here.
		const hosted: PlacementStore = store(db);
		expect(hosted.kind).toBe("supabase");
		// False is load-bearing: readMuxState/rememberMachine throw a clear fatal
		// rather than handing the router a promise it would read as "no machines".
		expect(hosted.synchronous).toBe(false);
	});

	it("refuses to construct without a tenant, which would read every tenant's rows", () => {
		expect(() => new SupabasePlacementStore({ tenantId: "", client: new FakeDb() })).toThrow(
			/non-empty tenantId/,
		);
		expect(() => createSupabasePlacementStore("", new FakeDb())).toThrow(HostedMuxError);
	});

	it("reads an empty state on a fresh tenant rather than failing", async () => {
		const db = new FakeDb();
		await expect(store(db).read()).resolves.toEqual({ machines: {} });
	});

	it("names a migration that exists and declares what the store depends on", () => {
		// The 42P01 message quotes this path as the fix. If the file is renamed
		// or never written, the only instruction a caller gets when the schema is
		// missing points at nothing -- and it points there precisely when they
		// are already confused about why their tenant looks empty.
		const ddl = readFileSync(
			join(process.cwd(), "..", PLACEMENTS_MIGRATION),
			"utf8",
		);
		expect(ddl).toMatch(
			new RegExp(`create table if not exists ${PLACEMENTS_TABLE}\\b`, "i"),
		);
		// Guarantee 10: updated_at from the database clock needs the TRIGGER, not
		// just the column default -- PostgREST's upsert does not re-apply a
		// default on the ON CONFLICT UPDATE path, so a column-only schema would
		// freeze a re-remembered placement at its first-insert timestamp.
		expect(ddl).toMatch(/create trigger trg_mux_placements_touch/i);
		expect(ddl).toMatch(/before insert or update on mux_placements/i);
		// Both check constraints, since the fake enforces them and would
		// otherwise be testing rules the real table does not have.
		expect(ddl).toMatch(/constraint mux_placements_kind check/i);
		expect(ddl).toMatch(/constraint mux_placements_shape check/i);
		for (const column of READ_COLUMNS.split(",").map((c) => c.trim())) {
			expect(ddl, `read() selects ${column}`).toMatch(
				new RegExp(`^\\s*${column}\\s`, "m"),
			);
		}
	});

	it("crosses the package boundary type-only, so next build can still resolve it", () => {
		// ROADMAP 3c, measured: the compiled dist is the only import form
		// Turbopack resolves, because it applies no .js -> .ts alias and every
		// src/mux specifier carries .js. tsc and vitest resolve the source
		// happily, so nothing else in this suite would notice a value import --
		// asserting the import form is the only cheap guard against the deploy.
		const source = readFileSync(
			join(process.cwd(), "lib", "mux", "placement-store.ts"),
			"utf8",
		);
		const crossings = source.match(
			/^(?:import|export)[^;]*?from "\.\.\/\.\.\/\.\.\/src\/[^"]+";/gm,
		);
		expect(crossings, "the store must import the real mux contract").not.toBeNull();
		for (const crossing of crossings ?? []) {
			expect(crossing, crossing).toMatch(/^(?:import|export) type /);
		}
	});
});

// ---------------------------------------------------------------------------
// Guarantee 1: scoping
// ---------------------------------------------------------------------------

describe("tenant scoping", () => {
	it("returns only the caller's placements", async () => {
		const db = new FakeDb();
		await store(db, "tenant-a").remember("alpha", E2B_CLAUDE);
		await store(db, "tenant-b").remember("beta", SPRITES_CODEX);

		const a = await store(db, "tenant-a").read();
		const b = await store(db, "tenant-b").read();

		expect(Object.keys(a.machines)).toEqual(["alpha"]);
		expect(Object.keys(b.machines)).toEqual(["beta"]);
	});

	it("keeps names unique per tenant, never globally", async () => {
		// The postmortem's failure mode, priced: two tenants both call a machine
		// "dev". Resolving "dev" from global state sent commands to the WRONG
		// machine once already, so each tenant must see only its own sandbox id.
		const db = new FakeDb();
		await store(db, "tenant-a").remember("dev", E2B_CLAUDE);
		await store(db, "tenant-b").remember("dev", SPRITES_CODEX);

		const a = await store(db, "tenant-a").read();
		const b = await store(db, "tenant-b").read();

		expect(a.machines.dev.sandboxId).toBe("e2b-sandbox-1");
		expect(a.machines.dev.substrate).toBe("e2b");
		expect(b.machines.dev.sandboxId).toBe("am-mux-beta");
		expect(b.machines.dev.substrate).toBe("sprites");
		// Two rows, not one overwritten row.
		expect(db.rows.filter((row) => row.name === "dev")).toHaveLength(2);
	});

	it("scopes the read statement itself on tenant_id", async () => {
		const db = new FakeDb();
		await store(db, "tenant-a").read();
		expect(db.selects()).toEqual([
			{
				op: "select",
				table: PLACEMENTS_TABLE,
				columns: READ_COLUMNS,
				filters: [["tenant_id", "tenant-a"]],
			},
		]);
	});

	it("cannot forget another tenant's placement", async () => {
		const db = new FakeDb();
		await store(db, "tenant-a").remember("dev", E2B_CLAUDE);
		await store(db, "tenant-b").forget("dev");

		const a = await store(db, "tenant-a").read();
		expect(a.machines.dev).toBeDefined();
		expect(db.deletes()[0].filters).toEqual([
			["tenant_id", "tenant-b"],
			["name", "dev"],
		]);
	});

	it("cannot overwrite another tenant's health", async () => {
		const db = new FakeDb();
		await store(db, "tenant-a").saveHealth(healthSnapshot());
		await store(db, "tenant-b").saveHealth(healthSnapshot(999));

		const a = await store(db, "tenant-a").read();
		const b = await store(db, "tenant-b").read();
		expect(a.health?.substrates.e2b?.openedAt).toBeUndefined();
		expect(b.health?.substrates.e2b?.openedAt).toBe(999);
	});
});

// ---------------------------------------------------------------------------
// Guarantee 2: no lost inserts
// ---------------------------------------------------------------------------

describe("no lost inserts", () => {
	it("keeps both names when two writers remember different machines concurrently", async () => {
		const db = new FakeDb();
		const hosted = store(db);

		// Interleave them: neither statement runs until both have been issued,
		// which is the window in which the old read-modify-write writer dropped
		// whichever name it had not seen when it took its copy of the file.
		db.hold();
		const first = hosted.remember("alpha", E2B_CLAUDE);
		const second = hosted.remember("beta", SPRITES_CODEX);
		expect(db.log).toHaveLength(0);
		db.open();
		await Promise.all([first, second]);

		const state = await hosted.read();
		expect(Object.keys(state.machines).sort()).toEqual(["alpha", "beta"]);
	});

	it("remembers with a single upsert and no read at all", async () => {
		// The mechanism, not a detail: there is no read-modify-write to lose a
		// race in, so there is nothing to lock.
		const db = new FakeDb();
		await store(db).remember("alpha", E2B_CLAUDE);
		expect(db.ops()).toEqual(["upsert"]);
		expect(db.upserts()[0].onConflict).toBe(CONFLICT_TARGET);
		expect(CONFLICT_TARGET).toBe("tenant_id,kind,name");
	});

	it("re-remembering a name updates the same row instead of adding one", async () => {
		const db = new FakeDb();
		const hosted = store(db);
		await hosted.remember("alpha", E2B_CLAUDE);
		await hosted.remember("alpha", SPRITES_CODEX);

		expect(db.rows.filter((row) => row.kind === PLACEMENT_KIND)).toHaveLength(1);
		const state = await hosted.read();
		expect(state.machines.alpha.substrate).toBe("sprites");
		expect(state.machines.alpha.sandboxId).toBe("am-mux-beta");
	});

	it("does not touch another name's row when one name is written", async () => {
		const db = new FakeDb();
		const hosted = store(db);
		await hosted.remember("alpha", E2B_CLAUDE);
		await hosted.remember("beta", SPRITES_CODEX);
		// Each payload carries exactly one name: a whole-document write would
		// have to mention both.
		expect(db.upserts().map((entry) => entry.row.name)).toEqual(["alpha", "beta"]);
	});
});

// ---------------------------------------------------------------------------
// Guarantee 3: saveHealth writes health only
// ---------------------------------------------------------------------------

describe("saveHealth", () => {
	it("does not clobber the tenant's machines", async () => {
		const db = new FakeDb();
		const hosted = store(db);
		await hosted.remember("alpha", E2B_CLAUDE);
		await hosted.remember("beta", SPRITES_CODEX);

		await hosted.saveHealth(healthSnapshot(555));

		const state = await hosted.read();
		expect(Object.keys(state.machines).sort()).toEqual(["alpha", "beta"]);
		expect(state.machines.alpha.sandboxId).toBe("e2b-sandbox-1");
		expect(state.health?.substrates.e2b?.openedAt).toBe(555);
	});

	it("writes the health column only -- the payload names no machine column", async () => {
		const db = new FakeDb();
		await store(db).saveHealth(healthSnapshot());
		const payload = db.upserts()[0].row;
		expect(Object.keys(payload).sort()).toEqual(["health", "kind", "name", "tenant_id"]);
		expect(payload.kind).toBe(HEALTH_KIND);
		expect(payload.name).toBe(HEALTH_ROW_NAME);
		expect(payload).not.toHaveProperty("substrate");
		expect(payload).not.toHaveProperty("sandbox_id");
		expect(payload).not.toHaveProperty("agent");
	});

	it("survives a machine written between two health saves", async () => {
		const db = new FakeDb();
		const hosted = store(db);
		await hosted.saveHealth(healthSnapshot());
		await hosted.remember("alpha", E2B_CLAUDE);
		await hosted.saveHealth(healthSnapshot(777));

		const state = await hosted.read();
		expect(state.machines.alpha).toBeDefined();
		expect(state.health?.substrates.e2b?.openedAt).toBe(777);
	});

	it("returns health even when the tenant has no machines yet", async () => {
		// The case that rules out a PostgREST embed: a breaker snapshot with no
		// placements is exactly when the router is about to create its first
		// machine and most wants to know which lane is failing.
		const db = new FakeDb();
		const hosted = store(db);
		await hosted.saveHealth(healthSnapshot(42));
		const state = await hosted.read();
		expect(state.machines).toEqual({});
		expect(state.health?.substrates.e2b?.openedAt).toBe(42);
	});

	it("keeps a machine named like the health row addressable", async () => {
		const db = new FakeDb();
		const hosted = store(db);
		await hosted.remember(HEALTH_KIND, E2B_CLAUDE);
		await hosted.saveHealth(healthSnapshot());
		const state = await hosted.read();
		expect(state.machines[HEALTH_KIND]?.sandboxId).toBe("e2b-sandbox-1");
		expect(state.health).toBeDefined();
	});

	it("degrades a health row this build cannot read to absent, never a crash", async () => {
		const db = new FakeDb();
		db.seed({ tenant_id: "tenant-a", kind: HEALTH_KIND, name: "", health: "not-an-object" });
		const state = await store(db).read();
		expect(state.health).toBeUndefined();
		expect(state.machines).toEqual({});
	});

	it("refuses a snapshot that is not an object", async () => {
		const db = new FakeDb();
		const hosted = store(db);
		const bad = null as unknown as SubstrateHealthSnapshot;
		expect(await kindOf(() => hosted.saveHealth(bad))).toBe("fatal");
		expect(db.log).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Guarantees 4 and 8: one consistent snapshot, one round trip
// ---------------------------------------------------------------------------

describe("read", () => {
	it("returns machines and health in a single statement", async () => {
		const db = new FakeDb();
		const hosted = store(db);
		await hosted.remember("alpha", E2B_CLAUDE);
		await hosted.saveHealth(healthSnapshot(9));
		db.log.length = 0;

		const state = await hosted.read();
		expect(db.ops()).toEqual(["select"]);
		expect(state.machines.alpha).toBeDefined();
		expect(state.health?.substrates.e2b?.openedAt).toBe(9);
	});

	it("fails closed on a response with no rows array", async () => {
		// Reporting "nothing remembered" would make create() provision a second
		// sandbox for a name that already has one, then overwrite its placement.
		const db = new FakeDb();
		const broken: SupabaseLike = {
			from: () => ({
				...db.from(PLACEMENTS_TABLE),
				select: () => ({ eq: async () => ({ data: null, error: null }) }),
			}),
		};
		const hosted = new SupabasePlacementStore({ tenantId: "tenant-a", client: broken });
		expect(await kindOf(() => hosted.read())).toBe("fatal");
	});

	it("does not fan out per machine name", async () => {
		const db = new FakeDb();
		const hosted = store(db);
		for (const name of ["a", "b", "c", "d"]) await hosted.remember(name, E2B_CLAUDE);
		db.log.length = 0;
		await hosted.read();
		expect(db.selects()).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// Guarantee 5: no expiry, pruned by forget() only
// ---------------------------------------------------------------------------

describe("no TTL", () => {
	it("never filters or deletes on age", async () => {
		const db = new FakeDb();
		// A placement remembered a year before the fake's clock. An age-based
		// store would hide it; the substrate is the only authority on whether
		// its sandbox is gone.
		db.seed({
			tenant_id: "tenant-a",
			name: "ancient",
			substrate: "e2b",
			sandbox_id: "e2b-old",
			agent: "claude-code",
			updated_at: "2025-01-01T00:00:00.000000+00:00",
		});
		const state = await store(db).read();
		expect(state.machines.ancient.sandboxId).toBe("e2b-old");
		// Only the tenant filter: no `gte`/`lt` on updated_at anywhere.
		expect(db.selects()[0].filters).toEqual([["tenant_id", "tenant-a"]]);
		expect(db.deletes()).toHaveLength(0);
	});

	it("prunes only through forget", async () => {
		const db = new FakeDb();
		const hosted = store(db);
		await hosted.remember("alpha", E2B_CLAUDE);
		await hosted.forget("alpha");
		expect(await hosted.read()).toEqual({ machines: {} });
	});

	it("forgets a row this build cannot parse, so garbage stays removable", async () => {
		const db = new FakeDb();
		// A name written by a newer build naming a substrate this one has no
		// adapter for: read() must hide it (connect would fail deep inside) and
		// forget() must still be able to remove it.
		db.seed({
			tenant_id: "tenant-a",
			name: "future",
			substrate: "some-new-substrate",
			sandbox_id: "sb-x",
			agent: "claude-code",
		});
		const hosted = store(db);
		expect((await hosted.read()).machines.future).toBeUndefined();
		expect(db.rows).toHaveLength(1);

		await hosted.forget("future");
		expect(db.rows).toHaveLength(0);
	});

	it("rejects an empty name, which is what keeps the health row unreachable", async () => {
		const db = new FakeDb();
		const hosted = store(db);
		await hosted.saveHealth(healthSnapshot(3));
		db.log.length = 0;

		expect(await kindOf(() => hosted.forget(""))).toBe("fatal");
		expect(db.log).toHaveLength(0);
		expect((await hosted.read()).health?.substrates.e2b?.openedAt).toBe(3);
	});

	it("treats forgetting an absent name as a no-op", async () => {
		const db = new FakeDb();
		await expect(store(db).forget("never-existed")).resolves.toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Guarantee 7: errors are MuxErrors
// ---------------------------------------------------------------------------

describe("error mapping", () => {
	it("maps a missing schema to fatal and names the migration to run", async () => {
		const db = new FakeDb();
		db.nextError = {
			code: "42P01",
			message: `relation "public.${PLACEMENTS_TABLE}" does not exist`,
		};
		const failure = await failureOf(() => store(db).read());
		expect(muxErrorKindOf(failure)).toBe("fatal");
		// The path, not just "run the DDL": an unapplied schema is indistinguishable
		// from an empty tenant at the call site, so the message is the only place
		// the fix can appear. The sibling test proves the path resolves to a file.
		expect(String((failure as Error).message)).toContain(PLACEMENTS_MIGRATION);
	});

	it.each([
		["40001", "could not serialize access due to concurrent update"],
		["08006", "connection failure"],
		["57014", "canceling statement due to statement timeout"],
		["53300", "too many connections for role"],
	])("maps %s to transient, because a retry could win", async (code, message) => {
		const db = new FakeDb();
		db.nextError = { code, message };
		expect(await kindOf(() => store(db).remember("alpha", E2B_CLAUDE))).toBe("transient");
	});

	it.each([
		["23514", "violates check constraint"],
		["42501", "permission denied for table"],
		["22P02", "invalid input syntax for type json"],
	])("maps %s to fatal, so the caller tears the sandbox down", async (code, message) => {
		const db = new FakeDb();
		db.nextError = { code, message };
		expect(await kindOf(() => store(db).remember("alpha", E2B_CLAUDE))).toBe("fatal");
	});

	it("maps a 429 to rate_limited", async () => {
		const db = new FakeDb();
		db.nextError = { code: "429", message: "Too Many Requests" };
		expect(await kindOf(() => store(db).read())).toBe("rate_limited");
	});

	it("maps a rejected key to missing_credentials, not to a retry", async () => {
		const db = new FakeDb();
		db.nextError = { code: "PGRST301", message: "JWT expired" };
		expect(await kindOf(() => store(db).read())).toBe("missing_credentials");
	});

	it("maps a thrown transport failure to transient", async () => {
		const db = new FakeDb();
		db.nextThrow = new TypeError("fetch failed");
		expect(await kindOf(() => store(db).read())).toBe("transient");
	});

	it("maps an unrecognized thrown value to fatal rather than retrying forever", async () => {
		const db = new FakeDb();
		db.nextThrow = new Error("column health is of type jsonb but expression is of type text");
		expect(await kindOf(() => store(db).remember("alpha", E2B_CLAUDE))).toBe("fatal");
	});

	it("reports a missing Supabase configuration as missing_credentials", async () => {
		// No injected client: the store resolves the shared admin client, which
		// throws when the env is absent. No retry can conjure the env vars, so
		// transient would be a lie.
		const hosted = new SupabasePlacementStore({ tenantId: "tenant-a" });
		expect(await kindOf(() => hosted.read())).toBe("missing_credentials");
	});

	it("raises MuxError-shaped errors, recognizable across the package boundary", async () => {
		const db = new FakeDb();
		db.nextError = { code: "42P01", message: "does not exist" };
		const failure = await failureOf(() => store(db).saveHealth(healthSnapshot()));
		expect(failure).toBeInstanceOf(HostedMuxError);
		expect((failure as Error).name).toBe("MuxError");
		expect((failure as HostedMuxError).kind).toBe("fatal");
	});

	it("names the operation and machine in the message, and never the tenant", async () => {
		const db = new FakeDb();
		db.nextError = { code: "08006", message: "server closed the connection" };
		const failure = await failureOf(() => store(db, "user_2xSECRET").remember("alpha", E2B_CLAUDE));
		const message = String((failure as Error).message);
		expect(message).toMatch(/remember "alpha"/);
		expect(message).not.toMatch(/user_2xSECRET/);
	});

	it("refuses an incomplete placement instead of writing an unreachable machine", async () => {
		const db = new FakeDb();
		const hosted = store(db);
		const bad = { substrate: "moonbase", sandboxId: "sb-1", agent: "claude-code" } as unknown as MachinePlacement;
		expect(await kindOf(() => hosted.remember("alpha", bad))).toBe("fatal");
		const noSandbox = { substrate: "e2b", sandboxId: "", agent: "claude-code" } as MachinePlacement;
		expect(await kindOf(() => hosted.remember("alpha", noSandbox))).toBe("fatal");
		expect(await kindOf(() => hosted.remember("", E2B_CLAUDE))).toBe("fatal");
		// Nothing reached the database on any of the three.
		expect(db.log).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Guarantee 9: no secrets
// ---------------------------------------------------------------------------

describe("no secrets", () => {
	it("writes substrate ids only, dropping any extra field a caller attaches", async () => {
		const db = new FakeDb();
		const leaky = {
			...E2B_CLAUDE,
			apiKey: "sk-ant-should-never-be-stored",
			env: { ANTHROPIC_API_KEY: "sk-ant-also-not" },
			token: "e2b_secret",
		} as unknown as MachinePlacement;

		await store(db).remember("alpha", leaky);

		const payload = db.upserts()[0].row;
		expect(Object.keys(payload).sort()).toEqual([
			"agent",
			"kind",
			"name",
			"sandbox_id",
			"substrate",
			"tenant_id",
		]);
		expect(JSON.stringify(db.rows)).not.toMatch(/sk-ant|e2b_secret|ANTHROPIC_API_KEY/);
	});

	it("selects a closed column list, so a secret column added later cannot leak", async () => {
		const db = new FakeDb();
		db.seed({
			tenant_id: "tenant-a",
			name: "alpha",
			substrate: "e2b",
			sandbox_id: "e2b-sandbox-1",
			agent: "claude-code",
		});
		// A column some future migration adds to the same table.
		(db.rows[0] as unknown as Record<string, unknown>).api_key = "sk-leak";

		const state = await store(db).read();
		expect(READ_COLUMNS).not.toContain("*");
		expect(db.selects()[0].columns).toBe(READ_COLUMNS);
		expect(JSON.stringify(state)).not.toMatch(/sk-leak/);
		expect(Object.keys(state.machines.alpha).sort()).toEqual([
			"agent",
			"sandboxId",
			"substrate",
			"updatedAt",
		]);
	});
});

// ---------------------------------------------------------------------------
// Guarantee 10: the database clock
// ---------------------------------------------------------------------------

describe("updatedAt", () => {
	it("never sends a client timestamp", async () => {
		const db = new FakeDb();
		await store(db).remember("alpha", E2B_CLAUDE);
		await store(db).saveHealth(healthSnapshot());
		for (const entry of db.upserts()) {
			expect(entry.row).not.toHaveProperty("updated_at");
		}
	});

	it("reports the database clock, normalized to UTC ISO 8601", async () => {
		const db = new FakeDb();
		const hosted = store(db);
		await hosted.remember("alpha", E2B_CLAUDE);
		const state = await hosted.read();
		// The fake's clock, not the test process's: a client-written value could
		// not produce a 2026-08-02T12:00 stamp.
		expect(state.machines.alpha.updatedAt).toBe("2026-08-02T12:00:01.000Z");
	});

	it("advances the stamp when a name is re-remembered", async () => {
		const db = new FakeDb();
		const hosted = store(db);
		await hosted.remember("alpha", E2B_CLAUDE);
		const first = (await hosted.read()).machines.alpha.updatedAt;
		await hosted.remember("alpha", SPRITES_CODEX);
		const second = (await hosted.read()).machines.alpha.updatedAt;
		expect(Date.parse(second)).toBeGreaterThan(Date.parse(first));
	});

	it("passes an unparseable stamp through rather than hiding a live machine", async () => {
		const db = new FakeDb();
		db.seed({
			tenant_id: "tenant-a",
			name: "alpha",
			substrate: "e2b",
			sandbox_id: "e2b-sandbox-1",
			agent: "claude-code",
			updated_at: "whenever",
		});
		const state = await store(db).read();
		expect(state.machines.alpha.updatedAt).toBe("whenever");
		expect(state.machines.alpha.sandboxId).toBe("e2b-sandbox-1");
	});

	it("hides a row with no stamp at all, which cannot be a row this store wrote", async () => {
		const db = new FakeDb();
		db.seed({
			tenant_id: "tenant-a",
			name: "alpha",
			substrate: "e2b",
			sandbox_id: "e2b-sandbox-1",
			agent: "claude-code",
			updated_at: "",
		});
		expect((await store(db).read()).machines.alpha).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// The production path: the real client, adapted
// ---------------------------------------------------------------------------

describe("supabase-js adapter", () => {
	type Chain = { table: string; columns?: string; filters: Array<[string, string]>; row?: unknown; onConflict?: string };

	function vendorFake(chains: Chain[]) {
		return {
			from: (table: string) => ({
				select: (columns: string) => ({
					eq: (column: string, value: string) => {
						chains.push({ table, columns, filters: [[column, value]] });
						return Promise.resolve({ data: [], error: null });
					},
				}),
				upsert: (row: unknown, options: { onConflict: string }) => {
					chains.push({ table, row, onConflict: options.onConflict, filters: [] });
					return Promise.resolve({ data: null, error: null });
				},
				delete: () => ({
					eq: (first: string, firstValue: string) => ({
						eq: (second: string, secondValue: string) => {
							chains.push({
								table,
								filters: [
									[first, firstValue],
									[second, secondValue],
								],
							});
							return Promise.resolve({ data: null, error: null });
						},
					}),
				}),
			}),
		};
	}

	it("issues the three statements against the real client's builder shape", async () => {
		const chains: Chain[] = [];
		mocks.supabaseAdmin.mockReturnValue(vendorFake(chains));
		const hosted = new SupabasePlacementStore({ tenantId: "tenant-a" });

		await hosted.read();
		await hosted.remember("alpha", E2B_CLAUDE);
		await hosted.forget("alpha");

		expect(chains).toEqual([
			{
				table: PLACEMENTS_TABLE,
				columns: READ_COLUMNS,
				filters: [["tenant_id", "tenant-a"]],
			},
			{
				table: PLACEMENTS_TABLE,
				onConflict: CONFLICT_TARGET,
				filters: [],
				row: {
					tenant_id: "tenant-a",
					kind: PLACEMENT_KIND,
					name: "alpha",
					substrate: "e2b",
					sandbox_id: "e2b-sandbox-1",
					agent: "claude-code",
				},
			},
			{
				table: PLACEMENTS_TABLE,
				filters: [
					["tenant_id", "tenant-a"],
					["name", "alpha"],
				],
			},
		]);
	});

	it("resolves the client per call, so constructing a store never throws", () => {
		expect(() => new SupabasePlacementStore({ tenantId: "tenant-a" })).not.toThrow();
		expect(mocks.supabaseAdmin).not.toHaveBeenCalled();
	});
});
