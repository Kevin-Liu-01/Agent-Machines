/**
 * Normalized capabilities as a routing input.
 *
 * A caller declares what a run NEEDS (`RouteConstraints`); every substrate
 * already declares what it HAS (`SandboxCapabilities` in ./types.ts, declared
 * per adapter in ./providers with a vendor URL and a read date beside every
 * value). `filterCandidates` intersects the two and, for every rejection,
 * names the constraint and the substrate's actual value. Those strings are
 * surfaced in `machine.attempts` and in the dashboard's "why did this land on
 * sprites?" panel, so a vague reason is a product defect rather than a
 * cosmetic one.
 *
 * There is exactly ONE declaration site. This module used to carry its own
 * `SUBSTRATE_LIMITS` table for sizing and run duration, which meant two
 * sources of truth for the same vendor facts; those values now live in each
 * adapter's `capabilities.limits` with their citations, and nothing here
 * restates a vendor number.
 *
 * Fail closed, in both directions:
 *
 *   - A fact the vendor does not publish is "unknown" (or an absent axis,
 *     which reads the same), and an unknown REJECTS a constraint that needs
 *     it. An unprovable floor loses the lane instead of hoping it holds.
 *   - Being able to ASK for something only counts when the request is
 *     honored. A forwarded-but-ignored request looks like success at
 *     placement time and starves the run later.
 */

import type {
	EgressPolicy,
	PersistenceModel,
	PtySupport,
	RequestSupport,
	SandboxCapabilities,
	SubstrateKind,
	SubstrateLimits,
	Unknown,
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
	/** The run must land in this region (data residency, latency to a peer). */
	region?: string;
	/** The run needs an accelerator it can actually reach. */
	gpu?: boolean;
	/** Required outbound posture: "blocked" is the untrusted-code case. */
	egress?: EgressPolicy;
	/** The run needs to spawn a second sandbox from this one's state. */
	fork?: boolean;
	/** Floor on the vCPU count the run will actually get. */
	minVcpu?: number;
	/** Floor on the memory the run will actually get, in MiB. */
	minMemoryMib?: number;
	/** Floor on the disk the run will actually get, in GiB. */
	minDiskGib?: number;
	/** Simultaneous public ports the run needs on one sandbox. */
	minPublicPorts?: number;
	/** Sandboxes the caller intends to run at once on this account. */
	minConcurrency?: number;
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

/**
 * Every axis absent, i.e. every vendor fact unknown. Used for a substrate
 * that declares no limits at all, so the checks below can read one shape and
 * an undeclared axis rejects exactly like an explicitly unknown one.
 */
export const UNKNOWN_LIMITS: SubstrateLimits = {
	baseVcpu: "unknown",
	baseMemoryMib: "unknown",
	baseDiskGib: "unknown",
	maxVcpu: "unknown",
	maxMemoryMib: "unknown",
	maxDiskGib: "unknown",
	maxRuntimeMs: "unknown",
	maxConcurrentSandboxes: "unknown",
	resourceRequest: "unknown",
};

export type SubstrateProfile = {
	substrate: SubstrateKind;
	/** Read from the provider, never restated here, so it cannot drift. */
	capabilities: SandboxCapabilities;
};

export function profileFor(
	substrate: SubstrateKind,
	capabilities: SandboxCapabilities,
): SubstrateProfile {
	return { substrate, capabilities };
}

function limitsOf(profile: SubstrateProfile): SubstrateLimits {
	return profile.capabilities.limits ?? UNKNOWN_LIMITS;
}

function quote(value: string): string {
	return `"${value}"`;
}

function renderSize(value: number | Unknown, unit: string): string {
	return value === "unknown" ? "unknown" : `${value} ${unit}`;
}

function renderList(value: readonly string[] | Unknown): string {
	if (value === "unknown") return "unknown";
	return value.length === 0 ? "none" : value.map(quote).join(", ");
}

/** Naming for one size dimension, so a rejection reason reads correctly. */
type SizeDimension = {
	constraint: "minVcpu" | "minMemoryMib" | "minDiskGib";
	unit: string;
	base: number | Unknown;
	ceiling: number | Unknown;
	/** Whether the mux can ask for more of THIS dimension. */
	request: RequestSupport;
	/** How the request is named in the "actual" field ("resource requests"). */
	requestNoun: string;
	/** What the caller would have to set for it to matter. */
	requestLabel: string;
};

/**
 * A floor on machine size is satisfiable two ways: the substrate is already
 * that big, or it can be asked to be. Asking only counts when the request is
 * actually honored -- a forwarded-but-ignored request looks like success and
 * then starves the harness at run time.
 */
function checkSizeFloor(
	profile: SubstrateProfile,
	floor: number,
	dimension: SizeDimension,
): ConstraintFailure | null {
	const { substrate } = profile;
	const { constraint, unit, base, ceiling, request } = dimension;
	if (typeof base === "number" && base >= floor) return null;
	if (request === "honored" && typeof ceiling === "number" && ceiling >= floor) {
		return null;
	}

	const required = `at least ${floor} ${unit}`;
	const actual = `baseline ${renderSize(base, unit)}, ceiling ${renderSize(
		ceiling,
		unit,
	)}, ${dimension.requestNoun} ${request}`;
	const head =
		typeof base === "number"
			? `${substrate} baseline is ${base} ${unit}`
			: `${substrate} publishes no baseline size`;
	const tail =
		request === "honored"
			? `and its ceiling is ${renderSize(ceiling, unit)}`
			: `and ${dimension.requestLabel} is ${request} on this substrate, so a larger size cannot be guaranteed`;
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
	const { substrate, capabilities } = profile;
	const limits = limitsOf(profile);
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

	if (constraints.region !== undefined) {
		const wanted = constraints.region;
		const region = capabilities.region;
		const declaredDefault = region?.default ?? "unknown";
		const available = region?.available ?? "unknown";
		const select = region?.select ?? "unknown";
		// Two ways to be sure of a region: the substrate already places
		// sandboxes there, or it lets the mux pin one from a published list.
		// A "close to you" placement is neither, so it fails.
		// The literal "unknown" is the model's absent value, not a region, so
		// asking for it must never be satisfied by a lane that publishes none.
		const placedThere = declaredDefault !== "unknown" && declaredDefault === wanted;
		const selectable =
			select === "honored" && available !== "unknown" && available.includes(wanted);
		if (!placedThere && !selectable) {
			const head =
				declaredDefault === "unknown"
					? `${substrate} publishes no default region`
					: `${substrate} places sandboxes in ${quote(declaredDefault)}`;
			failures.push({
				constraint: "region",
				required: quote(wanted),
				actual: `default ${
					declaredDefault === "unknown" ? "unknown" : quote(declaredDefault)
				}, available ${renderList(available)}, region requests ${select}`,
				reason: `region: requires ${quote(wanted)}, ${head} (available ${renderList(
					available,
				)}) and region requests are ${select}`,
			});
		}
	}

	if (constraints.gpu === true) {
		const gpu = capabilities.gpu;
		const available = gpu?.available ?? "unknown";
		const request = gpu?.request ?? "unknown";
		// A vendor that HAS accelerators is not enough: CreateSandboxOptions
		// has no GPU field, so unless the request is honored a run cannot be
		// placed on one on purpose.
		if (available !== true || request !== "honored") {
			failures.push({
				constraint: "gpu",
				required: "true",
				actual: `available ${String(available)}, gpu requests ${request}`,
				reason: `gpu: required, ${substrate} reports GPU available=${String(
					available,
				)} and GPU requests are ${request}`,
			});
		}
	}

	if (constraints.egress !== undefined) {
		const wanted = constraints.egress;
		const network = capabilities.network;
		const egress = network?.egress ?? "unknown";
		const control = network?.control ?? "unknown";
		if (egress !== wanted && control !== "honored") {
			failures.push({
				constraint: "egress",
				required: quote(wanted),
				actual: `${
					egress === "unknown" ? "unknown" : quote(egress)
				}, egress control ${control}`,
				reason: `egress: requires ${quote(wanted)}, ${substrate} provides ${
					egress === "unknown" ? "unknown" : quote(egress)
				} and egress control is ${control}`,
			});
		}
	}

	if (constraints.fork === true) {
		const fork = capabilities.fork;
		const vendor = fork?.vendor ?? "unknown";
		const exposed = fork?.exposed ?? false;
		if (vendor !== true || !exposed) {
			// Naming the mux as the blocker matters: on two of four substrates
			// the vendor can fork and only our contract cannot, which is a
			// roadmap item rather than a substrate limitation.
			const reason =
				vendor === true && !exposed
					? `fork: required, ${substrate} can fork but the mux exposes no fork operation`
					: `fork: required, ${substrate} reports vendor fork=${String(
							vendor,
						)} and the mux exposes no fork operation`;
			failures.push({
				constraint: "fork",
				required: "true",
				actual: `vendor ${String(vendor)}, exposed ${String(exposed)}`,
				reason,
			});
		}
	}

	if (constraints.minVcpu !== undefined) {
		const failure = checkSizeFloor(profile, constraints.minVcpu, {
			constraint: "minVcpu",
			unit: "vCPU",
			base: limits.baseVcpu,
			ceiling: limits.maxVcpu,
			request: limits.resourceRequest,
			requestNoun: "resource requests",
			requestLabel: "CreateSandboxOptions.resources",
		});
		if (failure) failures.push(failure);
	}

	if (constraints.minMemoryMib !== undefined) {
		const failure = checkSizeFloor(profile, constraints.minMemoryMib, {
			constraint: "minMemoryMib",
			unit: "MiB",
			base: limits.baseMemoryMib,
			ceiling: limits.maxMemoryMib,
			request: limits.resourceRequest,
			requestNoun: "resource requests",
			requestLabel: "CreateSandboxOptions.resources",
		});
		if (failure) failures.push(failure);
	}

	if (constraints.minDiskGib !== undefined) {
		const failure = checkSizeFloor(profile, constraints.minDiskGib, {
			constraint: "minDiskGib",
			unit: "GiB",
			base: limits.baseDiskGib,
			ceiling: limits.maxDiskGib,
			// Disk is its own dimension: CreateSandboxOptions.resources carries
			// vcpu and memory only, so no substrate can be asked for a bigger
			// disk through the mux, whatever the vendor would allow.
			request: "unsupported",
			requestNoun: "disk requests",
			requestLabel: "a disk-size request",
		});
		if (failure) failures.push(failure);
	}

	if (constraints.minPublicPorts !== undefined) {
		const wanted = constraints.minPublicPorts;
		const ports = capabilities.publicPorts;
		const model = ports?.model ?? "unknown";
		const muxMax = ports?.muxMax ?? "unknown";
		// "any-port" satisfies any count without a published ceiling: the
		// substrate maps a URL per port on demand, so there is no number to
		// compare against and inventing one would be the guess.
		const satisfied =
			model === "any-port" || (typeof muxMax === "number" && muxMax >= wanted);
		if (!satisfied) {
			const fixed = ports?.fixed;
			const fixedNote =
				fixed && fixed.length > 0 ? ` (only ${fixed.join(", ")})` : "";
			const head =
				typeof muxMax === "number"
					? `${substrate} exposes ${muxMax}${fixedNote}`
					: `${substrate} publishes no public port count (unknown)`;
			const plural = wanted === 1 ? "port" : "ports";
			failures.push({
				constraint: "minPublicPorts",
				required: `at least ${wanted} public ${plural}`,
				actual: `model ${String(model)}, mux exposes ${
					muxMax === "unknown" ? "unknown" : String(muxMax)
				}`,
				reason: `minPublicPorts: requires at least ${wanted} public ${plural}, ${head}`,
			});
		}
	}

	if (constraints.minConcurrency !== undefined) {
		const wanted = constraints.minConcurrency;
		const ceiling = limits.maxConcurrentSandboxes;
		if (typeof ceiling !== "number" || ceiling < wanted) {
			const head =
				typeof ceiling === "number"
					? `${substrate} allows at most ${ceiling}`
					: `${substrate} publishes no concurrency limit (unknown)`;
			failures.push({
				constraint: "minConcurrency",
				required: `${wanted} concurrent sandboxes`,
				actual: ceiling === "unknown" ? "unknown" : String(ceiling),
				reason: `minConcurrency: requires ${wanted} concurrent sandboxes, ${head}`,
			});
		}
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
