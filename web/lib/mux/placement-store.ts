/**
 * Hosted placement store (ROADMAP 0.4, pillar 12).
 *
 * `src/mux/state.ts` owns the contract: `PlacementStore` is read / remember /
 * forget / saveHealth, `LocalJsonPlacementStore` is the OSS default over
 * ~/.agent-machines/mux-state.json, and the header of that file lists ten
 * guarantees a hosted implementation owes. This module is that implementation,
 * over Supabase, so a placement outlives the host that created it -- which is
 * what lets the mux run somewhere without a durable home directory (a Vercel
 * function has no writable $HOME that survives the next invocation, so the
 * local store silently forgets every machine it ever created there).
 *
 * WHY the mux contract is imported `type`-only, and why nothing here imports a
 * mux *value*: the compiled `dist/` is the ONLY import form Turbopack
 * resolves. Measured 2026-08-02 (ROADMAP 3c): `turbopack.root` is the workspace
 * root and crossing out of `web/` is fine, but Turbopack applies no `.js` ->
 * `.ts` extension alias anywhere in this project -- proven by a `./helper.js`
 * import of a same-directory `helper.ts` inside `web/` failing too -- and every
 * ESM specifier in `src/mux` carries `.js`. A value import therefore has to go
 * through `agent-machines` (the built package), which makes `build:sdk` a
 * build-order dependency of `next build`. Type-only imports are erased by SWC
 * before Turbopack sees them, so this file is checked against the REAL contract
 * with no bundling cost, no mirror to drift, and no build order to get wrong.
 *
 * ---------------------------------------------------------------------------
 * SCHEMA -- WRITTEN, NOT YET APPLIED
 * ---------------------------------------------------------------------------
 *
 * The DDL is `web/supabase/migrations/006_mux_placements.sql`, and that file is
 * the only copy: a second copy in this header would be a second thing to keep
 * in sync, and the one that drifts is always the comment. `read()` and
 * `remember()` raise a `fatal` MuxError naming that migration when Postgres
 * reports the relation is undefined (42P01), so an unapplied schema fails closed
 * with the fix in the message rather than looking like an empty tenant.
 *
 * Writing the file does not apply it. Someone with database access still has to
 * run it against the project (Supabase SQL editor, or `supabase db push`), and
 * until they do, nothing here works against a real Postgres -- the upsert
 * semantics, the check constraints and the trigger are reproduced in the fake
 * and argued from the DDL, never observed.
 *
 * ---------------------------------------------------------------------------
 * The ten guarantees, and where each is kept
 * ---------------------------------------------------------------------------
 *
 *  1. SCOPING. `tenantId` is required, non-empty, and appended to every
 *     statement -- the SELECT, the DELETE, and both upsert rows. Names are
 *     unique per tenant because the primary key is (tenant_id, kind, name),
 *     never (name). A store instance can address exactly one tenant: there is
 *     no method that takes a tenant argument, so no caller can widen its own
 *     scope, and there is no "active tenant" to fall back to. The 2026-05-18
 *     postmortem is the reason for that shape rather than a convenient
 *     `read(tenantId?)`: seven API routes resolved their target from global
 *     state instead of the id in the request, and commands went to the WRONG
 *     machine. A placement store that resolved a name globally would be the
 *     same defect with a bigger blast radius -- one tenant's `connect("dev")`
 *     landing on another tenant's sandbox.
 *
 *  2. NO LOST INSERTS. `remember()` is one `INSERT .. ON CONFLICT
 *     (tenant_id, kind, name) DO UPDATE`. There is no read-modify-write to
 *     lose a race in and therefore nothing to lock: two shells remembering
 *     different names touch different rows, and both survive by construction.
 *     `remember()` issues no SELECT at all -- the test asserts that, because
 *     it is the mechanism, not a detail.
 *
 *  3. saveHealth() WRITES THE HEALTH COLUMN ONLY. Its row carries
 *     tenant_id + kind + name + health and nothing else, and it is a
 *     different row from every placement, so the tenant's machines are not in
 *     the statement's blast radius even if it fails halfway. This is the bug
 *     `src/mux/state.ts` exists to fix ("replace the tenant's whole
 *     document"), and here it is structurally unreachable rather than merely
 *     avoided.
 *
 *  4. CONSISTENT SNAPSHOT. Machines and health live in ONE table, so `read()`
 *     is a single SELECT: one statement, one MVCC snapshot, machines and
 *     health from the same point in time. Two tables would have needed either
 *     two round trips (two points in time) or a PostgREST embed, and an embed
 *     loses data at the edges -- parent-first returns nothing for a tenant
 *     with placements but no health row, child-first returns nothing for a
 *     tenant with health but no placements, and that second case is exactly
 *     when the breaker's memory matters most (no machines yet, about to
 *     create one). A placement is one row written by one statement, so a
 *     reader also cannot observe half of one.
 *
 *  5. NO EXPIRY. Nothing here filters or deletes on age; the only delete is
 *     `forget()`. The substrate is the only authority on whether a sandbox is
 *     gone, and an age threshold would either drop live long-running machines
 *     or keep dead ones, having no way to tell them apart.
 *
 *  6. DURABILITY ACROSS HOSTS. The rows are in Postgres, so a placement
 *     written by a Vercel function is readable by the next one, by the CLI,
 *     and by another operator on the same tenant. That is the entire point of
 *     the seam.
 *
 *  7. ERRORS ARE MuxErrors. Every failure leaves here as a `MuxError`-shaped
 *     throw (see `HostedMuxError`): `transient` when a retry could plausibly
 *     win (connection, deadlock, statement timeout, pooler exhaustion),
 *     `rate_limited` on a 429, `missing_credentials` when the Supabase env is
 *     absent or its key is rejected, and `fatal` otherwise -- including a
 *     schema that has not been applied. Fail closed: a `remember()` that
 *     throws makes the router tear the sandbox down instead of leaking a
 *     machine nobody can reach but everybody pays for.
 *
 *  8. LATENCY. `read()` sits on the create and connect paths: one round trip,
 *     no fan-out, no per-name query, explicit columns rather than a second
 *     schema lookup.
 *
 *  9. NO SECRETS. Rows are built column by column from a closed list, so an
 *     extra field on a caller's object -- an api key, an env bag -- cannot
 *     reach the database even if some future `MachinePlacement` grows one.
 *     Reads name their columns for the same reason. Substrate ids only.
 *
 * 10. updatedAt IS THE DATABASE CLOCK. Writers never send `updated_at`; the
 *     trigger above sets it. `read()` normalizes whatever Postgres returns to
 *     UTC ISO 8601 so the value is comparable to the local store's.
 */

import type { SubstrateHealthSnapshot } from "../../../src/mux/health.js";
import type {
	MachinePlacement,
	MuxState,
	PlacementStore,
	RememberedMachine,
} from "../../../src/mux/state.js";
import type {
	HarnessKind as MuxHarnessKind,
	MuxErrorKind,
	SubstrateKind as MuxSubstrateKind,
} from "../../../src/mux/types.js";
import {
	HARNESS_CAPABILITIES,
	SUBSTRATE_CAPABILITIES,
	type HarnessKind,
	type SubstrateKind,
} from "@/lib/mux/capabilities";
import { supabaseAdmin } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Schema constants
// ---------------------------------------------------------------------------

export const PLACEMENTS_TABLE = "mux_placements";

/**
 * Where the DDL lives, quoted in the 42P01 message. Exported so a test can
 * assert the file exists: this string is the only instruction a caller gets
 * when the schema is missing, and a path that has been renamed out from under
 * it turns "here is your fix" into a dead end at the worst moment.
 */
export const PLACEMENTS_MIGRATION = "web/supabase/migrations/006_mux_placements.sql";

/** Discriminators. See the DDL: the check constraint enforces both shapes. */
export const PLACEMENT_KIND = "placement";
export const HEALTH_KIND = "health";

/**
 * The health row's name.
 *
 * Empty, and doubly unreachable as a machine name: `remember()` and
 * `forget()` both reject an empty name (as the local store's `remember()`
 * does), and the primary key includes `kind` anyway. So a tenant may have a
 * machine called "health" without colliding with its breaker state.
 */
export const HEALTH_ROW_NAME = "";

/** Matches the primary key. Anything narrower would not be a valid conflict target. */
export const CONFLICT_TARGET = "tenant_id,kind,name";

/**
 * Read columns, named rather than `*`.
 *
 * Two reasons, both guarantees: a column added later (guarantee 9 -- say
 * someone stores a token on this table) cannot leak into a placement, and the
 * projection is stable so a schema change shows up as a missing-column fatal
 * instead of a silently different shape.
 */
export const READ_COLUMNS = "kind,name,substrate,sandbox_id,agent,health,updated_at";

// ---------------------------------------------------------------------------
// Drift guards against the real mux contract
// ---------------------------------------------------------------------------

/**
 * Validation needs the kind lists at RUN time, and `SUBSTRATE_KINDS` /
 * `HARNESS_KINDS` in `src/mux/config.ts` are values, so they cannot be
 * imported here (see the header). `lib/mux/capabilities.ts` already mirrors
 * both sets inside the web package and `capabilities.test.ts` diffs every
 * mirrored value against the mux sources, so reusing it adds no third copy.
 */
const KNOWN_SUBSTRATES: readonly SubstrateKind[] = SUBSTRATE_CAPABILITIES.map(
	(entry) => entry.kind,
);
const KNOWN_HARNESSES: readonly HarnessKind[] = HARNESS_CAPABILITIES.map(
	(entry) => entry.kind,
);

/**
 * Compile-time proof that the mirror still covers every mux kind.
 *
 * The drift that matters here is one-directional: a substrate or harness the
 * mux knows and the mirror does not would make `read()` reject a perfectly
 * good placement, hiding a machine that is alive and billing. That is exactly
 * the failure `forget()`-only pruning exists to avoid, so it fails `tsc`
 * instead. (A mirror member the mux does not have fails on its own, where the
 * validated value is assigned into `RememberedMachine`.)
 */
export type MirrorCoversMuxSubstrates = MuxSubstrateKind extends SubstrateKind
	? true
	: never;
export type MirrorCoversMuxHarnesses = MuxHarnessKind extends HarnessKind
	? true
	: never;
export const MIRROR_COVERS_MUX_SUBSTRATES: MirrorCoversMuxSubstrates = true;
export const MIRROR_COVERS_MUX_HARNESSES: MirrorCoversMuxHarnesses = true;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * A `MuxError` raised from the web package.
 *
 * WHY not the real class: `MuxError` lives above Turbopack's root, so it is
 * not constructible here (header). `name` is therefore set to "MuxError" and
 * `kind` carries the taxonomy, which is the same structural contract
 * `muxErrorKindOf()` in `lib/providers/mux-facade.ts` already recovers -- and
 * that function exists because an error crossing a package boundary can fail
 * `instanceof` against a second copy of a class even when both are present.
 *
 * Deliberately no `substrate` scope, unlike `MuxError`'s optional one: a
 * database failure says nothing about whether E2B is reachable, and tagging it
 * with a substrate invites some future caller to fold a Supabase outage into
 * that substrate's health window and demote a lane that is perfectly healthy.
 */
export class HostedMuxError extends Error {
	readonly kind: MuxErrorKind;

	constructor(kind: MuxErrorKind, message: string) {
		super(message);
		this.name = "MuxError";
		this.kind = kind;
	}
}

/**
 * Postgres error classes where a retry could plausibly win, by prefix:
 *
 *   08 -- connection exception (dropped socket, pooler closed the link)
 *   53 -- insufficient resources (too_many_connections is the common one on a
 *         serverless deployment with a bursty function count)
 *   57 -- operator intervention (admin shutdown, statement timeout 57014,
 *         "cannot connect now" during a restart)
 *
 * Everything else is fatal by default. That asymmetry is deliberate: calling a
 * permanent failure `transient` invites a retry loop, and `transient` is also
 * a routable error in the mux (`isRoutableError`), so over-reporting it would
 * charge a substrate for a database problem.
 */
const TRANSIENT_CODE_PREFIXES: readonly string[] = ["08", "53", "57"];

/** Specific retryable codes outside those classes. */
const TRANSIENT_CODES: ReadonlySet<string> = new Set([
	"40001", // serialization_failure
	"40P01", // deadlock_detected
	"55P03", // lock_not_available
	"58030", // io_error
]);

/**
 * PostgREST auth rejections. `missing_credentials` rather than `fatal` because
 * the distinction is actionable: the key we hold is absent, wrong or expired,
 * so a retry with it fails identically and the fix is configuration.
 */
const CREDENTIAL_CODES: ReadonlySet<string> = new Set([
	"PGRST301", // no/invalid JWT
	"PGRST302", // anonymous access disabled
]);

/** Schema-not-applied codes. Fatal, and the message points at the DDL above. */
const SCHEMA_CODES: ReadonlySet<string> = new Set([
	"42P01", // undefined_table
	"42703", // undefined_column
	"42883", // undefined_function (the updated_at trigger helper)
]);

/**
 * Transport failures never reach us as a Postgres code: supabase-js rejects
 * with a fetch `TypeError` when the socket dies, and a pooler can report its
 * own exhaustion as a generic internal error. Matching the message is the only
 * signal available, and a retry is the correct response to all of them.
 */
const TRANSIENT_MESSAGE_PATTERNS: readonly RegExp[] = [
	/fetch failed/i,
	/network|socket hang up|econnreset|econnrefused|etimedout|eai_again/i,
	/timeout|timed out/i,
	/too many (?:clients|connections)/i,
	/temporarily unavailable|service unavailable|connection closed/i,
];

const RATE_LIMIT_PATTERNS: readonly RegExp[] = [
	/rate limit/i,
	/too many requests/i,
];

function messageOf(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return String(error);
}

function isTransientMessage(message: string): boolean {
	return TRANSIENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

/** Where the failure happened, for a message an operator can act on. */
function scopeOf(operation: string, name: string | null): string {
	return name === null ? operation : `${operation} "${name}"`;
}

/**
 * Classify a PostgREST error object.
 *
 * The tenant id is deliberately absent from the message: it identifies a
 * person, adds nothing an operator can act on that the request context does
 * not already carry, and these strings end up in logs.
 */
function fromDbError(
	operation: string,
	name: string | null,
	error: { message?: unknown; code?: unknown; details?: unknown },
): HostedMuxError {
	const code = typeof error.code === "string" ? error.code : "";
	const message = typeof error.message === "string" ? error.message : String(error.message);
	const detail = typeof error.details === "string" && error.details.length > 0
		? ` (${error.details})`
		: "";
	const where = `mux placement store ${scopeOf(operation, name)} failed`;
	const suffix = `${code ? `[${code}] ` : ""}${message}${detail}`;

	if (SCHEMA_CODES.has(code)) {
		return new HostedMuxError(
			"fatal",
			`${where}: ${suffix}. The ${PLACEMENTS_TABLE} schema has not been applied -- ` +
				`run ${PLACEMENTS_MIGRATION}.`,
		);
	}
	if (CREDENTIAL_CODES.has(code)) {
		return new HostedMuxError("missing_credentials", `${where}: ${suffix}`);
	}
	if (code === "429" || RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(message))) {
		return new HostedMuxError("rate_limited", `${where}: ${suffix}`);
	}
	if (
		TRANSIENT_CODES.has(code) ||
		TRANSIENT_CODE_PREFIXES.some((prefix) => code.startsWith(prefix)) ||
		(code === "" && isTransientMessage(message))
	) {
		return new HostedMuxError("transient", `${where}: ${suffix}`);
	}
	return new HostedMuxError("fatal", `${where}: ${suffix}`);
}

/** Classify a thrown value (no PostgREST envelope: the request never landed). */
function fromThrown(
	operation: string,
	name: string | null,
	error: unknown,
): HostedMuxError {
	if (error instanceof HostedMuxError) return error;
	const message = messageOf(error);
	const where = `mux placement store ${scopeOf(operation, name)} failed`;
	if (RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(message))) {
		return new HostedMuxError("rate_limited", `${where}: ${message}`);
	}
	// A throw from the client is a transport failure until proven otherwise --
	// the statement never reached Postgres, so a retry is the honest response.
	if (isTransientMessage(message)) {
		return new HostedMuxError("transient", `${where}: ${message}`);
	}
	return new HostedMuxError("fatal", `${where}: ${message}`);
}

// ---------------------------------------------------------------------------
// The slice of supabase-js this store drives
// ---------------------------------------------------------------------------

export type DbError = {
	message?: unknown;
	code?: unknown;
	details?: unknown;
	hint?: unknown;
};

export type DbResult = { data?: unknown; error?: DbError | null };

/**
 * Filter steps, spelled out to the exact depth this store uses: one `eq` after
 * a select (tenant), two after a delete (tenant + name). Deliberately not a
 * self-referential `eq(): DbFilter`, and deliberately not intersected with
 * `PromiseLike` at every step the way the real builder is -- see
 * `adaptSupabase` for what that costs.
 */
export type DbFilter1 = { eq(column: string, value: string): Promise<DbResult> };
export type DbFilter2 = { eq(column: string, value: string): DbFilter1 };

/**
 * The three statements this store issues, in builder shape.
 *
 * Shaped like supabase-js (rather than as `selectByTenant(...)` helpers) for
 * one reason: a test fake then observes the actual query -- the projection, the
 * `eq` filters, the conflict target -- so the tenant-scoping and no-TTL
 * guarantees are asserted against the query the store really builds instead of
 * against an argument handed to a wrapper.
 *
 * `select` takes the literal column list, not `string`, so the projection is
 * part of the type (guarantee 9's read half).
 */
export type SupabaseLike = {
	from(table: string): {
		select(columns: typeof READ_COLUMNS): DbFilter1;
		upsert(row: Record<string, unknown>, options: { onConflict: string }): Promise<DbResult>;
		delete(): DbFilter2;
	};
};

/**
 * Adapt the shared admin client to the slice above.
 *
 * WHY this is delegation and not `const db: SupabaseLike = supabaseAdmin()`:
 * measured with tsc 5.7 against @supabase/supabase-js 2.111.0, handing a real
 * PostgrestFilterBuilder to a hand-written chain type fails with TS2589 ("type
 * instantiation is excessively deep and possibly infinite"). The vendor parses
 * the select string into the row type with template-literal types and types
 * `eq` as `<ColumnName extends string & keyof Row>`, so comparing those
 * *signatures* instantiates the parser at its constraint. Awaiting each real
 * builder inside this adapter avoids that entirely: the only cross-type check
 * left is the response object against `DbResult`, which is cheap -- and every
 * vendor call above is still checked at its real argument types, which a cast
 * would have thrown away.
 *
 * The consequence is that each step here buffers its arguments and the
 * statement is issued at the last one. That is invisible to the store, which
 * awaits the end of every chain.
 */
function adaptSupabase(sb: ReturnType<typeof supabaseAdmin>): SupabaseLike {
	return {
		from: (table: string) => ({
			select: (columns: typeof READ_COLUMNS) => ({
				eq: async (column: string, value: string) =>
					await sb.from(table).select(columns).eq(column, value),
			}),
			upsert: async (row: Record<string, unknown>, options: { onConflict: string }) =>
				await sb.from(table).upsert(row, options),
			delete: () => ({
				eq: (first: string, firstValue: string) => ({
					eq: async (second: string, secondValue: string) =>
						await sb
							.from(table)
							.delete()
							.eq(first, firstValue)
							.eq(second, secondValue),
				}),
			}),
		}),
	};
}

// ---------------------------------------------------------------------------
// Row parsing
// ---------------------------------------------------------------------------

type PlacementRow = {
	kind?: unknown;
	name?: unknown;
	substrate?: unknown;
	sandbox_id?: unknown;
	agent?: unknown;
	health?: unknown;
	updated_at?: unknown;
};

function isKnown<T extends string>(kinds: readonly T[], value: unknown): value is T {
	return typeof value === "string" && (kinds as readonly string[]).includes(value);
}

/**
 * UTC ISO 8601, from whatever Postgres sent.
 *
 * PostgREST renders timestamptz as "2026-08-02T12:00:00.123456+00:00"; the
 * local store writes `new Date().toISOString()`. Normalizing here keeps
 * entries from the two stores comparable, which is guarantee 10's whole point.
 *
 * An unparseable value is passed through rather than rejected: `updatedAt` is
 * diagnostic, and dropping a placement over a cosmetic field would hide a
 * live sandbox that keeps billing.
 */
function toIsoUtc(value: string): string {
	const ms = Date.parse(value);
	return Number.isNaN(ms) ? value : new Date(ms).toISOString();
}

/**
 * Validate one row, or reject it -- the same contract as the local store's
 * `parsePlacement`: `read()` returns only placements the router can act on, and
 * a rejected row stays in the table and remains removable through `forget()`.
 */
function parsePlacement(row: PlacementRow): RememberedMachine | null {
	if (typeof row.sandbox_id !== "string" || row.sandbox_id.length === 0) return null;
	if (!isKnown(KNOWN_SUBSTRATES, row.substrate)) return null;
	if (!isKnown(KNOWN_HARNESSES, row.agent)) return null;
	if (typeof row.updated_at !== "string" || row.updated_at.length === 0) return null;
	return {
		substrate: row.substrate,
		sandboxId: row.sandbox_id,
		agent: row.agent,
		updatedAt: toIsoUtc(row.updated_at),
	};
}

/**
 * Accept the breaker snapshot as an opaque object, exactly as the local store
 * does: `SubstrateHealth.fromJSON` version-checks it and re-parses every
 * sample, and duplicating that here would be a second place to keep in step
 * with the breaker's shape. A non-object is dropped, which degrades to "assume
 * healthy" -- never to a crash.
 */
function parseHealth(value: unknown): SubstrateHealthSnapshot | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as SubstrateHealthSnapshot;
}

function assertName(operation: string, name: string): void {
	if (typeof name !== "string" || name.length === 0) {
		// Also what keeps the health row unreachable from forget(): see
		// HEALTH_ROW_NAME.
		throw new HostedMuxError(
			"fatal",
			`mux placement store ${operation} needs a non-empty machine name`,
		);
	}
}

/**
 * Build the placement row column by column.
 *
 * This is guarantee 9 in code: the row is a closed list of six columns, so a
 * caller object carrying an api key, a token or an env bag cannot put it in
 * the database -- not today, and not if `MachinePlacement` grows a field
 * later. It is also the local store's "refuse to write something read() would
 * then hide" check: a machine that exists and can never be reached is worse
 * than a failed create, so an unknown substrate or harness fails here.
 */
function toPlacementRow(
	tenantId: string,
	name: string,
	placement: MachinePlacement,
): Record<string, unknown> {
	if (
		!isKnown(KNOWN_SUBSTRATES, placement.substrate) ||
		!isKnown(KNOWN_HARNESSES, placement.agent) ||
		typeof placement.sandboxId !== "string" ||
		placement.sandboxId.length === 0
	) {
		throw new HostedMuxError(
			"fatal",
			`refusing to remember "${name}": incomplete placement (substrate=${String(
				placement.substrate,
			)}, agent=${String(placement.agent)}, sandboxId=${String(placement.sandboxId)})`,
		);
	}
	return {
		tenant_id: tenantId,
		kind: PLACEMENT_KIND,
		name,
		substrate: placement.substrate,
		sandbox_id: placement.sandboxId,
		agent: placement.agent,
		// No updated_at: the database clock owns it (guarantee 10).
	};
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

export type SupabasePlacementStoreOptions = {
	/**
	 * The scope key. Required and non-empty -- a store with no tenant would
	 * read the whole table (guarantee 1). The hosted caller passes its Clerk
	 * user id today; the column is named `tenant_id` rather than `user_id`
	 * because a placement is a property of whoever pays for the sandbox, and
	 * an org that shares machines is one tenant with many users.
	 */
	tenantId: string;
	/** Injected in tests. Omitted in production; resolved lazily per call. */
	client?: SupabaseLike;
};

export class SupabasePlacementStore implements PlacementStore {
	readonly kind = "supabase";
	/**
	 * Every method is a network round trip, so this store cannot satisfy the
	 * synchronous compatibility API in `src/mux/state.ts` (`readMuxState` and
	 * friends). Saying so is what makes those helpers throw a clear `fatal`
	 * instead of handing the router a promise it would read as "no machines
	 * remembered" -- and then create a second sandbox for a name that already
	 * has one.
	 */
	readonly synchronous = false;
	private readonly tenantId: string;
	private readonly injected?: SupabaseLike;

	constructor(options: SupabasePlacementStoreOptions) {
		if (typeof options.tenantId !== "string" || options.tenantId.length === 0) {
			throw new HostedMuxError(
				"fatal",
				"SupabasePlacementStore needs a non-empty tenantId: an unscoped store would read every tenant's placements",
			);
		}
		this.tenantId = options.tenantId;
		if (options.client !== undefined) this.injected = options.client;
	}

	/** One SELECT: guarantees 4 and 8. */
	async read(): Promise<MuxState> {
		const data = await this.request("read", null, (sb) =>
			sb.from(PLACEMENTS_TABLE).select(READ_COLUMNS).eq("tenant_id", this.tenantId),
		);
		// Fail closed on a shape PostgREST should never produce (an empty table
		// is `[]`, not null). Degrading to "nothing remembered" would be worse
		// than an error here: `connect` would report an unknown machine, and
		// `create` would provision a SECOND sandbox for a name that already has
		// one and then overwrite its placement, orphaning the first.
		if (!Array.isArray(data)) {
			throw new HostedMuxError(
				"fatal",
				`mux placement store read returned no rows array (got ${typeof data})`,
			);
		}
		const rows = data as PlacementRow[];
		const machines: Record<string, RememberedMachine> = {};
		let health: SubstrateHealthSnapshot | undefined;
		for (const row of rows) {
			if (!row || typeof row !== "object") continue;
			if (row.kind === HEALTH_KIND) {
				const snapshot = parseHealth(row.health);
				if (snapshot) health = snapshot;
				continue;
			}
			// Rows of an unrecognized kind are ignored rather than guessed at: a
			// newer build's shape must not be read as a placement.
			if (row.kind !== PLACEMENT_KIND) continue;
			if (typeof row.name !== "string" || row.name.length === 0) continue;
			const placement = parsePlacement(row);
			if (placement) machines[row.name] = placement;
		}
		const state: MuxState = { machines };
		if (health) state.health = health;
		return state;
	}

	/** One upsert on (tenant_id, kind, name), no read: guarantee 2. */
	async remember(name: string, placement: MachinePlacement): Promise<void> {
		assertName("remember", name);
		const row = toPlacementRow(this.tenantId, name, placement);
		await this.request("remember", name, (sb) =>
			sb.from(PLACEMENTS_TABLE).upsert(row, { onConflict: CONFLICT_TARGET }),
		);
	}

	/**
	 * The only delete in this file (guarantee 5), and it is not filtered on
	 * `kind` on purpose: a row this build cannot parse must still be
	 * removable, and a non-empty name can only be a placement because the
	 * health row's name is empty and `assertName` rejects that.
	 */
	async forget(name: string): Promise<void> {
		assertName("forget", name);
		await this.request("forget", name, (sb) =>
			sb
				.from(PLACEMENTS_TABLE)
				.delete()
				.eq("tenant_id", this.tenantId)
				.eq("name", name),
		);
	}

	/**
	 * Health only, in its own row: guarantee 3. The payload names four
	 * columns, none of which a placement uses, so there is no statement here
	 * that could drop a machine even if it failed halfway.
	 *
	 * Last-writer-wins is intentional and matches the local store: a snapshot
	 * is one whole-store aggregate of a rolling window held in memory, so
	 * there is no per-key merge to perform. The loser's samples are gone, the
	 * breaker re-learns from the next outcome, and what must never happen --
	 * losing a machine to a health write -- cannot.
	 */
	async saveHealth(snapshot: SubstrateHealthSnapshot): Promise<void> {
		if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
			throw new HostedMuxError(
				"fatal",
				"saveHealth needs a health snapshot object",
			);
		}
		const row: Record<string, unknown> = {
			tenant_id: this.tenantId,
			kind: HEALTH_KIND,
			name: HEALTH_ROW_NAME,
			health: snapshot,
		};
		await this.request("saveHealth", null, (sb) =>
			sb.from(PLACEMENTS_TABLE).upsert(row, { onConflict: CONFLICT_TARGET }),
		);
	}

	/**
	 * Resolved per call rather than in the constructor so that constructing a
	 * store never throws on a machine that has not been configured yet, and so
	 * a missing Supabase env surfaces as `missing_credentials` -- the one kind
	 * that tells a caller no retry can help.
	 */
	private client(): SupabaseLike {
		if (this.injected) return this.injected;
		try {
			return adaptSupabase(supabaseAdmin());
		} catch (error) {
			throw new HostedMuxError(
				"missing_credentials",
				`mux placement store is not configured: ${messageOf(error)}`,
			);
		}
	}

	private async request(
		operation: string,
		name: string | null,
		build: (sb: SupabaseLike) => PromiseLike<DbResult>,
	): Promise<unknown> {
		const sb = this.client();
		let result: DbResult;
		try {
			result = await build(sb);
		} catch (error) {
			throw fromThrown(operation, name, error);
		}
		if (result?.error) throw fromDbError(operation, name, result.error);
		return result?.data;
	}
}

/**
 * Convenience constructor for the hosted path.
 *
 * Kept separate from `setPlacementStore()` (which lives in `src/mux/state.ts`
 * and cannot be called from here -- header) so that installing the store stays
 * an explicit decision at the mux entry point rather than a side effect of
 * importing this module.
 */
export function createSupabasePlacementStore(
	tenantId: string,
	client?: SupabaseLike,
): SupabasePlacementStore {
	return client === undefined
		? new SupabasePlacementStore({ tenantId })
		: new SupabasePlacementStore({ tenantId, client });
}
