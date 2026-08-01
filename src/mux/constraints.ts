/**
 * Normalized capabilities as a routing input.
 *
 * A caller declares what a run NEEDS (`RouteConstraints`); every substrate
 * already declares what it HAS (`SandboxCapabilities` in ./types.ts).
 * `filterCandidates` intersects the two and, for every rejection, names the
 * constraint and the substrate's actual value. Those strings are surfaced in
 * `machine.attempts` and in the dashboard's "why did this land on sprites?"
 * panel, so a vague reason is a product defect rather than a cosmetic one.
 *
 * Two dimensions the capability record does not carry -- machine size and how
 * long a single run may stay up -- come from `SUBSTRATE_LIMITS` below, whose
 * every entry cites a vendor page or one of our own measurements. Anything a
 * vendor does not publish is `"unknown"` and fails closed: an unprovable
 * floor rejects the lane instead of hoping it holds.
 */

import type {
	PersistenceModel,
	PtySupport,
	SandboxCapabilities,
	SubstrateKind,
} from "./types.js";

/**
 * A native PTY is a strict superset of the tmux-over-exec fallback (resize
 * and control characters reach the process directly), so PTY support is a
 * total order and `pty` can be expressed as a floor instead of a set.
 */
const PTY_RANK: Record<PtySupport, number> = {
	none: 0,
	tmux: 1,
	native: 2,
};

export type RouteConstraints = {
	/** Minimum PTY fidelity: "native" rejects tmux, "tmux" accepts either. */
	pty?: PtySupport;
	/** Acceptable persistence models; any one of them satisfies. */
	persistence?: PersistenceModel | PersistenceModel[];
	/**
	 * Boolean constraints are one-directional: `true` requires the
	 * capability, `false` and `undefined` both mean "do not care". No caller
	 * needs a substrate that *cannot* reattach, and callers compute these
	 * flags dynamically, so `false` has to be a legal no-op rather than a
	 * type error or an inverted requirement.
	 */
	reattach?: boolean;
	publicUrl?: boolean;
	streamingExec?: boolean;
	/** Floor on the vCPU count the run will actually get. */
	minVcpu?: number;
	/** Floor on the memory the run will actually get, in MiB. */
	minMemoryMib?: number;
	/** Longest this run may need to stay up, in milliseconds. */
	maxRuntimeMs?: number;
};

export type RouteConstraintKey = keyof RouteConstraints;

export type ConstraintFailure = {
	constraint: RouteConstraintKey;
	/** What the caller asked for, rendered for humans. */
	required: string;
	/** What this substrate actually offers, rendered for humans. */
	actual: string;
	/** One sentence naming both; goes straight into a route attempt reason. */
	reason: string;
};

export type ConstraintRejection = {
	substrate: SubstrateKind;
	/** Every dimension that failed, not just the first. */
	failures: ConstraintFailure[];
	/** All failures joined, because a route attempt carries one string. */
	reason: string;
};

export type ConstraintFilterResult = {
	/** Survivors, in the order they were offered (primary before backups). */
	accepted: SubstrateKind[];
	rejected: ConstraintRejection[];
};

/** A fact the vendor does not publish and we have not measured. */
export type Unknown = "unknown";

/**
 * Whether `CreateSandboxOptions.resources` changes the machine a run gets.
 * "ignored" means the mux provider does not forward the request at all;
 * "unknown" means it is forwarded but was not observed to take effect.
 */
export type ResourceRequestSupport = "honored" | "ignored" | "unknown";

export type SubstrateLimits = {
	/** Size a sandbox gets without asking for anything. */
	baseVcpu: number | Unknown;
	baseMemoryMib: number | Unknown;
	/** Documented ceiling on the lowest published plan tier. */
	maxVcpu: number | Unknown;
	maxMemoryMib: number | Unknown;
	/** Longest single continuous run, lowest published tier. */
	maxRuntimeMs: number | Unknown;
	resourceRequest: ResourceRequestSupport;
};

/**
 * Sizing and runtime facts the capability record does not carry.
 *
 * Ceilings are the LOWEST published tier, not the highest: we cannot prove
 * which plan a caller's key is on, so routing must promise only what the
 * cheapest plan guarantees. Vendors that publish nothing get "unknown".
 * Memory written as "GB" by a vendor is read as 1024 MiB here; the two
 * conventions differ by 7% and the conservative reading is the smaller one.
 */
export const SUBSTRATE_LIMITS: Record<SubstrateKind, SubstrateLimits> = {
	// Baseline measured by us, not published: docs/MUX-RESULTS.md finding 10
	// (2026-07-31) recorded the E2B base sandbox as 478 MB and 2 vCPU, which
	// is why a Hermes install exhausts it. That figure is read as MiB here
	// (it has the shape of a `free -m` reading, and E2B's own pricing page
	// meters memory in MiB); the two readings differ by 22 MiB, well inside
	// the granularity anyone declares a memory floor at. Ceilings from
	// https://e2b.dev/pricing (read 2026-08-01): vCPU tiers 1/2/4/6/8, memory
	// priced "between 512 MiB and 8,192 MiB". Runtime from
	// https://e2b.dev/docs/sandbox (read 2026-08-01): "Sandboxes can run
	// continuously for up to 24 hours (Pro) or 1 hour (Base)" -- Base here.
	// resourceRequest is "unknown", not "honored": the provider does forward
	// cpuCount/memoryMB (src/mux/providers/e2b.ts), but finding 10 records
	// that "E2B ignored the sizing request on this plan", so a larger machine
	// is not something routing may promise.
	e2b: {
		baseVcpu: 2,
		baseMemoryMib: 478,
		maxVcpu: 8,
		maxMemoryMib: 8192,
		maxRuntimeMs: 3_600_000,
		resourceRequest: "unknown",
	},
	// Fly publishes a memory ceiling but no baseline: flyio-support on
	// https://community.fly.io/t/16gb-ram-advertised-for-sprites-but-not-actually-available/28123
	// (2026-06-17) says "Currently the default is up to 8GB of memory, and you
	// can write in to support to request up to 16GB" -- an upper bound, not a
	// guaranteed allocation, so baseMemoryMib stays unknown and the ceiling is
	// the un-requested 8 GiB. No Fly-owned page states a vCPU ceiling or a
	// maximum run duration (checked 2026-08-01); sprites also auto-suspend on
	// idle (docs/MUX-RESULTS.md finding 9), which is a further reason not to
	// claim an unbounded run. The mux provider never forwards
	// options.resources for this substrate.
	sprites: {
		baseVcpu: "unknown",
		baseMemoryMib: "unknown",
		maxVcpu: "unknown",
		maxMemoryMib: 8192,
		maxRuntimeMs: "unknown",
		resourceRequest: "ignored",
	},
	// https://vercel.com/docs/sandbox/pricing (page last_updated 2026-06-16,
	// read 2026-08-01): "The default is 2 vCPUs" and "Each vCPU includes 2 GB
	// of memory", so the baseline is 2 vCPU / 4 GiB. Hobby ceilings are 4
	// vCPU / 8GB and a 45-minute maximum duration; Pro is 8 vCPU / 16GB / 24h
	// and Enterprise 32 vCPU / 64GB / 24h -- Hobby is used here because the
	// plan is unknown at routing time. The mux provider does not forward
	// options.resources even though the Vercel API accepts a vCPU count.
	vercel: {
		baseVcpu: 2,
		baseMemoryMib: 4096,
		maxVcpu: 4,
		maxMemoryMib: 8192,
		maxRuntimeMs: 2_700_000,
		resourceRequest: "ignored",
	},
	// https://www.dedaluslabs.ai/pricing (read 2026-08-01): Hobby is "Up to 4"
	// vCPU per machine and "Up to 16 GiB". No default size is published. The
	// Hobby runtime figure is "50 hrs/mo ceiling" -- a monthly aggregate, not
	// a per-run limit -- so the per-run maximum is unknown. options.resources
	// is not forwarded for this substrate.
	dedalus: {
		baseVcpu: "unknown",
		baseMemoryMib: "unknown",
		maxVcpu: 4,
		maxMemoryMib: 16384,
		maxRuntimeMs: "unknown",
		resourceRequest: "ignored",
	},
};

export type SubstrateProfile = {
	substrate: SubstrateKind;
	/** Read from the provider, never restated here, so it cannot drift. */
	capabilities: SandboxCapabilities;
	limits: SubstrateLimits;
};

export function profileFor(
	substrate: SubstrateKind,
	capabilities: SandboxCapabilities,
	limits: SubstrateLimits = SUBSTRATE_LIMITS[substrate],
): SubstrateProfile {
	return { substrate, capabilities, limits };
}

function quote(value: string): string {
	return `"${value}"`;
}

function renderSize(value: number | Unknown, unit: string): string {
	return value === "unknown" ? "unknown" : `${value} ${unit}`;
}

/**
 * A floor on machine size is satisfiable two ways: the substrate is already
 * that big, or it can be asked to be. Asking only counts when the request is
 * actually honored -- a forwarded-but-ignored request looks like success and
 * then starves the harness at run time.
 */
function checkSizeFloor(
	profile: SubstrateProfile,
	constraint: "minVcpu" | "minMemoryMib",
	floor: number,
	unit: string,
	base: number | Unknown,
	ceiling: number | Unknown,
): ConstraintFailure | null {
	const { substrate, limits } = profile;
	if (typeof base === "number" && base >= floor) return null;
	if (
		limits.resourceRequest === "honored" &&
		typeof ceiling === "number" &&
		ceiling >= floor
	) {
		return null;
	}

	const required = `at least ${floor} ${unit}`;
	const actual = `baseline ${renderSize(base, unit)}, ceiling ${renderSize(
		ceiling,
		unit,
	)}, resource requests ${limits.resourceRequest}`;
	const head =
		typeof base === "number"
			? `${substrate} baseline is ${base} ${unit}`
			: `${substrate} publishes no baseline size`;
	const tail =
		limits.resourceRequest === "honored"
			? `and its ceiling is ${renderSize(ceiling, unit)}`
			: `and CreateSandboxOptions.resources is ${limits.resourceRequest} on this substrate, so a larger size cannot be guaranteed`;
	return {
		constraint,
		required,
		actual,
		reason: `${constraint}: requires ${required}, ${head} ${tail}`,
	};
}

/** Every dimension of `constraints` this substrate fails to satisfy. */
export function checkConstraints(
	profile: SubstrateProfile,
	constraints: RouteConstraints = {},
): ConstraintFailure[] {
	const { substrate, capabilities, limits } = profile;
	const failures: ConstraintFailure[] = [];

	if (
		constraints.pty !== undefined &&
		PTY_RANK[capabilities.pty] < PTY_RANK[constraints.pty]
	) {
		failures.push({
			constraint: "pty",
			required: `at least ${quote(constraints.pty)}`,
			actual: quote(capabilities.pty),
			reason: `pty: requires at least ${quote(constraints.pty)}, ${substrate} provides ${quote(
				capabilities.pty,
			)}`,
		});
	}

	if (constraints.persistence !== undefined) {
		const wanted = Array.isArray(constraints.persistence)
			? constraints.persistence
			: [constraints.persistence];
		if (!wanted.includes(capabilities.persistence)) {
			const required = wanted.map(quote).join(" or ");
			failures.push({
				constraint: "persistence",
				required,
				actual: quote(capabilities.persistence),
				reason: `persistence: requires ${required}, ${substrate} provides ${quote(
					capabilities.persistence,
				)}`,
			});
		}
	}

	for (const key of ["reattach", "publicUrl", "streamingExec"] as const) {
		if (constraints[key] === true && capabilities[key] !== true) {
			failures.push({
				constraint: key,
				required: "true",
				actual: "false",
				reason: `${key}: required, ${substrate} reports ${key}=false`,
			});
		}
	}

	if (constraints.minVcpu !== undefined) {
		const failure = checkSizeFloor(
			profile,
			"minVcpu",
			constraints.minVcpu,
			"vCPU",
			limits.baseVcpu,
			limits.maxVcpu,
		);
		if (failure) failures.push(failure);
	}

	if (constraints.minMemoryMib !== undefined) {
		const failure = checkSizeFloor(
			profile,
			"minMemoryMib",
			constraints.minMemoryMib,
			"MiB",
			limits.baseMemoryMib,
			limits.maxMemoryMib,
		);
		if (failure) failures.push(failure);
	}

	if (constraints.maxRuntimeMs !== undefined) {
		const wanted = constraints.maxRuntimeMs;
		if (limits.maxRuntimeMs === "unknown") {
			failures.push({
				constraint: "maxRuntimeMs",
				required: `a run of up to ${wanted}ms`,
				actual: "unknown",
				reason: `maxRuntimeMs: requires a run of up to ${wanted}ms, ${substrate} publishes no maximum run duration (unknown)`,
			});
		} else if (limits.maxRuntimeMs < wanted) {
			failures.push({
				constraint: "maxRuntimeMs",
				required: `a run of up to ${wanted}ms`,
				actual: `${limits.maxRuntimeMs}ms`,
				reason: `maxRuntimeMs: requires a run of up to ${wanted}ms, ${substrate} allows at most ${limits.maxRuntimeMs}ms`,
			});
		}
	}

	return failures;
}

/**
 * Partition a route into lanes that satisfy the constraints and lanes that
 * do not, preserving the caller's order so the surviving route still reads
 * primary before backups.
 */
export function filterCandidates(
	profiles: readonly SubstrateProfile[],
	constraints: RouteConstraints = {},
): ConstraintFilterResult {
	const accepted: SubstrateKind[] = [];
	const rejected: ConstraintRejection[] = [];
	for (const profile of profiles) {
		const failures = checkConstraints(profile, constraints);
		if (failures.length === 0) {
			accepted.push(profile.substrate);
			continue;
		}
		rejected.push({
			substrate: profile.substrate,
			failures,
			reason: failures.map((failure) => failure.reason).join("; "),
		});
	}
	return { accepted, rejected };
}

/**
 * Structurally compatible with the router's `RouteAttempt`, declared here so
 * this module stays a leaf and never imports the router it feeds.
 */
export type ConstraintSkip = {
	substrate: SubstrateKind;
	outcome: "skipped";
	reason: string;
	/**
	 * The first dimension that failed. A UI can render "no native PTY"
	 * without re-parsing the joined reason string; `reason` still carries
	 * every failure for a human reading logs.
	 */
	constraint?: RouteConstraintKey;
};

/** Render rejections as route attempts, so the skip survives into the UI. */
export function asSkippedAttempts(
	rejected: readonly ConstraintRejection[],
): ConstraintSkip[] {
	return rejected.map((rejection) => ({
		substrate: rejection.substrate,
		outcome: "skipped" as const,
		reason: rejection.reason,
		constraint: rejection.failures[0]?.constraint,
	}));
}
