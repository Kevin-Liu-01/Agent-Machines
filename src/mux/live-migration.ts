/**
 * Provider-neutral live-migration machinery.
 *
 * "Live" here is an application-level drain and warm cutover, not a VM RAM
 * transplant. Agent Machines-managed commands take a lease on the worker.
 * Migration closes the gate, waits for those leases to drain, ships a final
 * stable filesystem delta, verifies it on the warm target, and only then lets
 * the caller atomically change placement. Processes are restarted from their
 * durable state on the target; their memory image is never claimed to move.
 *
 * The seam is deliberately the same two-method MoveSource / MoveTarget used by
 * statemove.ts. Both the direct mux and the hosted plane therefore execute one
 * gate, one delta format, and one deletion-safety policy.
 */

import { randomUUID } from "node:crypto";
import {
	DEFAULT_TAR_TIMEOUT_MS,
	exportTar,
	restoreTar,
	type ExportedTar,
	type MoveSource,
	type MoveTarget,
	type RestoreOptions,
	type StateMovePlan,
} from "./statemove.js";
import { MuxError } from "./types.js";

export type MigrationMode = "copy" | "live";

export const MIGRATION_DRAIN_EXIT_CODE = 75;
const LOCK_ATTEMPTS = 200;
const LOCK_POLL_SECONDS = "0.05";
const DEFAULT_DRAIN_TIMEOUT_MS = 300_000;
const DEFAULT_DRAIN_POLL_MS = 500;
const DEFAULT_STABILITY_ATTEMPTS = 3;
const DEFAULT_GATE_TTL_MS = 900_000;

function shq(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function safeToken(value: string, label: string): string {
	if (!/^[A-Za-z0-9._-]+$/.test(value)) {
		throw new MuxError("fatal", `${label} contains shell-unsafe characters`);
	}
	return value;
}

function stateRoot(): string {
	return '"$HOME/.agent-machines/state/migration"';
}

function lockFunctions(): string[] {
	return [
		`am_migration_root=${stateRoot()}`,
		`am_migration_lock="$am_migration_root/lock"`,
		`mkdir -p "$am_migration_root/runs"`,
		`am_lock_n=0`,
		`until mkdir "$am_migration_lock" 2>/dev/null; do`,
		`  am_lock_owner=$(cat "$am_migration_lock/pid" 2>/dev/null || echo 0)`,
		`  if [ "$am_lock_owner" -gt 1 ] 2>/dev/null && ! kill -0 "$am_lock_owner" 2>/dev/null; then rm -rf -- "$am_migration_lock"; continue; fi`,
		`  am_lock_mtime=$(stat -c %Y "$am_migration_lock" 2>/dev/null || echo 0)`,
		`  am_lock_age=$(( $(date +%s) - am_lock_mtime ))`,
		`  if [ "$am_lock_owner" -le 1 ] 2>/dev/null && [ "$am_lock_age" -ge 5 ]; then rm -rf -- "$am_migration_lock"; continue; fi`,
		`  am_lock_n=$((am_lock_n + 1))`,
		`  if [ "$am_lock_n" -ge ${LOCK_ATTEMPTS} ]; then echo AM_MIGRATION_LOCK_TIMEOUT >&2; exit 74; fi`,
		`  sleep ${LOCK_POLL_SECONDS}`,
		`done`,
		`printf '%s' "$$" > "$am_migration_lock/pid"`,
	];
}

/**
 * Wrap a command in the worker-side migration gate.
 *
 * The gate check and lease creation share an atomic mkdir lock with
 * beginMigrationDrain(), so a run is wholly before or wholly after the drain:
 * it either owns a lease the migration waits for, or exits 75 without starting.
 */
export function guardedRunCommand(
	command: string,
	options: { leaseId?: string; timeoutMs?: number } = {},
): string {
	const leaseId = safeToken(options.leaseId ?? randomUUID(), "migration lease id");
	const timeoutSeconds = Math.max(
		60,
		Math.ceil((options.timeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS) / 1000) + 60,
	);
	return [
		...lockFunctions(),
		`am_migration_gate="$am_migration_root/gate"`,
		`am_migration_lease="$am_migration_root/runs/${leaseId}"`,
		`if [ -s "$am_migration_gate" ]; then`,
		`  am_migration_gate_expires=$(sed -n '2p' "$am_migration_gate" 2>/dev/null || echo 0)`,
		`  if [ "$am_migration_gate_expires" -gt 0 ] 2>/dev/null && [ "$(date +%s)" -ge "$am_migration_gate_expires" ]; then`,
		`    rm -f "$am_migration_gate"`,
		`  else`,
		`    rm -rf -- "$am_migration_lock"`,
		`    echo AM_MIGRATION_DRAINING >&2`,
		`    exit ${MIGRATION_DRAIN_EXIT_CODE}`,
		`  fi`,
		`fi`,
		`am_migration_expires=$(( $(date +%s) + ${timeoutSeconds} ))`,
		`printf '%s\\n%s\\n' "$$" "$am_migration_expires" > "$am_migration_lease"`,
		`rm -rf -- "$am_migration_lock"`,
		`am_release_migration_lease() { rm -f "$am_migration_lease"; }`,
		`trap am_release_migration_lease EXIT HUP INT TERM`,
		`(`,
		command,
		`)`,
		`am_migration_code=$?`,
		`exit "$am_migration_code"`,
	].join("\n");
}

/** A control-plane HTTP request cannot put its work inside a sandbox shell.
 * It takes the same worker-side lease explicitly and releases it in `finally`. */
export async function acquireExternalRunLease(
	handle: MoveSource,
	options: { leaseId?: string; timeoutMs?: number } = {},
): Promise<string> {
	const leaseId = safeToken(options.leaseId ?? randomUUID(), "migration lease id");
	const timeoutSeconds = Math.max(
		60,
		Math.ceil((options.timeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS) / 1000) + 60,
	);
	const command = [
		...lockFunctions(),
		`am_migration_gate="$am_migration_root/gate"`,
		`am_migration_lease="$am_migration_root/runs/${leaseId}"`,
		`if [ -s "$am_migration_gate" ]; then`,
		`  am_migration_gate_expires=$(sed -n '2p' "$am_migration_gate" 2>/dev/null || echo 0)`,
		`  if [ "$am_migration_gate_expires" -gt 0 ] 2>/dev/null && [ "$(date +%s)" -ge "$am_migration_gate_expires" ]; then rm -f "$am_migration_gate"; else rm -rf -- "$am_migration_lock"; echo AM_MIGRATION_DRAINING >&2; exit ${MIGRATION_DRAIN_EXIT_CODE}; fi`,
		`fi`,
		// pid 0 means the owner is outside the sandbox; expiry + explicit release
		// are the authority instead of kill -0.
		`printf '0\\n%s\\n' "$(( $(date +%s) + ${timeoutSeconds} ))" > "$am_migration_lease"`,
		`rm -rf -- "$am_migration_lock"`,
		`echo AM_MIGRATION_LEASED`,
	].join("\n");
	const result = await handle.exec(command, { timeoutMs: 30_000 });
	if (result.exitCode === MIGRATION_DRAIN_EXIT_CODE) {
		throw new MuxError("transient", "machine is draining for live migration; retry on the new placement");
	}
	if (result.exitCode !== 0 || !result.stdout.includes("AM_MIGRATION_LEASED")) {
		throw new MuxError(
			"transient",
			`could not acquire the live-migration run lease (exit ${result.exitCode}): ${(result.stderr || result.stdout).trim().slice(-400)}`,
		);
	}
	return leaseId;
}

export async function releaseRunLease(handle: MoveSource, leaseId: string): Promise<void> {
	const token = safeToken(leaseId, "migration lease id");
	await handle
		.exec(`rm -f "$HOME/.agent-machines/state/migration/runs/${token}"`, {
			timeoutMs: 30_000,
		})
		.catch(() => undefined);
}

export type DrainStarted = {
	migrationId: string;
	activeRuns: number;
	startedAt: number;
};

/** Close the gate atomically against guardedRunCommand's lease creation. */
export async function beginMigrationDrain(
	handle: MoveSource,
	migrationId: string,
	options: { ttlMs?: number } = {},
): Promise<DrainStarted> {
	const id = safeToken(migrationId, "migration id");
	const ttlSeconds = Math.max(60, Math.ceil((options.ttlMs ?? DEFAULT_GATE_TTL_MS) / 1000));
	const command = [
		...lockFunctions(),
		`am_migration_gate="$am_migration_root/gate"`,
		`am_existing_migration=$(sed -n '1p' "$am_migration_gate" 2>/dev/null || true)`,
		`am_existing_expires=$(sed -n '2p' "$am_migration_gate" 2>/dev/null || echo 0)`,
		`if [ -n "$am_existing_migration" ] && [ "$am_existing_expires" -gt 0 ] 2>/dev/null && [ "$(date +%s)" -ge "$am_existing_expires" ]; then rm -f "$am_migration_gate"; am_existing_migration=; fi`,
		`if [ -n "$am_existing_migration" ] && [ "$am_existing_migration" != ${shq(id)} ]; then rm -rf -- "$am_migration_lock"; echo AM_MIGRATION_ALREADY_DRAINING >&2; exit 73; fi`,
		`printf '%s\\n%s\\n' ${shq(id)} "$(( $(date +%s) + ${ttlSeconds} ))" > "$am_migration_gate"`,
		`am_migration_count=$(find "$am_migration_root/runs" -type f 2>/dev/null | wc -l | tr -d ' ')`,
		`rm -rf -- "$am_migration_lock"`,
		`echo "AM_MIGRATION_DRAINED $am_migration_count"`,
	].join("\n");
	const result = await handle.exec(command, { timeoutMs: 30_000 });
	const count = /AM_MIGRATION_DRAINED\s+(\d+)/.exec(result.stdout)?.[1];
	if (result.exitCode !== 0 || count === undefined) {
		throw new MuxError(
			result.exitCode === 73 ? "transient" : "fatal",
			`could not begin the live-migration drain (exit ${result.exitCode}): ${(result.stderr || result.stdout).trim().slice(-400)}`,
		);
	}
	return { migrationId: id, activeRuns: Number.parseInt(count, 10), startedAt: Date.now() };
}

async function activeRunLeaseCount(handle: MoveSource): Promise<number> {
	const command = [
		`am_root=${stateRoot()}`,
		`mkdir -p "$am_root/runs"`,
		`am_now=$(date +%s)`,
		`am_count=0`,
		`for am_lease in "$am_root"/runs/*; do`,
		`  [ -f "$am_lease" ] || continue`,
		`  am_pid=$(sed -n '1p' "$am_lease" 2>/dev/null || echo 0)`,
		`  am_expires=$(sed -n '2p' "$am_lease" 2>/dev/null || echo 0)`,
		`  if [ "$am_expires" -gt 0 ] 2>/dev/null && [ "$am_now" -ge "$am_expires" ]; then rm -f "$am_lease"; continue; fi`,
		`  if [ "$am_pid" -gt 1 ] 2>/dev/null && ! kill -0 "$am_pid" 2>/dev/null; then rm -f "$am_lease"; continue; fi`,
		`  am_count=$((am_count + 1))`,
		`done`,
		`echo "AM_MIGRATION_ACTIVE $am_count"`,
	].join("\n");
	const result = await handle.exec(command, { timeoutMs: 30_000 });
	const count = /AM_MIGRATION_ACTIVE\s+(\d+)/.exec(result.stdout)?.[1];
	if (result.exitCode !== 0 || count === undefined) {
		throw new MuxError("transient", "could not read active run leases while draining");
	}
	return Number.parseInt(count, 10);
}

export async function waitForMigrationDrain(
	handle: MoveSource,
	started: DrainStarted,
	options: { timeoutMs?: number; pollMs?: number } = {},
): Promise<{ activeRuns: number; waitedMs: number }> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS;
	const pollMs = options.pollMs ?? DEFAULT_DRAIN_POLL_MS;
	const deadline = Date.now() + timeoutMs;
	let remaining = started.activeRuns;
	while (remaining > 0 && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, pollMs));
		remaining = await activeRunLeaseCount(handle);
	}
	if (remaining > 0) {
		throw new MuxError(
			"transient",
			`live migration timed out after ${timeoutMs}ms waiting for ${remaining} managed run${remaining === 1 ? "" : "s"} to drain`,
		);
	}
	return { activeRuns: started.activeRuns, waitedMs: Date.now() - started.startedAt };
}

/** Re-open a source after a pre-commit failure, or a committed keep/park. */
export async function cancelMigrationDrain(
	handle: MoveSource,
	migrationId: string,
): Promise<void> {
	const id = safeToken(migrationId, "migration id");
	const command = [
		...lockFunctions(),
		`am_migration_gate="$am_migration_root/gate"`,
		`if [ -s "$am_migration_gate" ] && [ "$(sed -n '1p' "$am_migration_gate")" = ${shq(id)} ]; then rm -f "$am_migration_gate"; fi`,
		`rm -rf -- "$am_migration_lock"`,
	].join("\n");
	const result = await handle.exec(command, { timeoutMs: 30_000 });
	if (result.exitCode !== 0) {
		throw new MuxError(
			"transient",
			`could not re-open the live-migration gate (exit ${result.exitCode}): ${(result.stderr || result.stdout).trim().slice(-400)}`,
		);
	}
}

export type LiveBaseline = {
	migrationId: string;
	markerPath: string;
	baselineListPath: string;
	include: string[];
	exclude: string[];
};

function assertPlanPaths(plan: StateMovePlan): void {
	for (const path of plan.include) {
		if (!/^[A-Za-z0-9._/-]+$/.test(path) || path.startsWith("/") || path.includes("..")) {
			throw new MuxError("fatal", `live migration plan contains an unsafe path: ${path}`);
		}
	}
	for (const pattern of plan.exclude) {
		if (!/^[A-Za-z0-9._/*?-]+$/.test(pattern) || pattern.startsWith("/") || pattern.includes("..")) {
			throw new MuxError("fatal", `live migration plan contains an unsafe exclusion: ${pattern}`);
		}
	}
}

function findExcludeExpression(exclude: readonly string[]): string {
	if (exclude.length === 0) return "";
	const matches = exclude
		.flatMap((pattern) =>
			pattern.includes("/")
				? [`-path ${shq(pattern)}`, `-path ${shq(`*/${pattern}`)}`]
				: [`-name ${shq(pattern)}`],
		)
		.join(" -o ");
	// Match tar's unanchored exclusions and prune dependency directories, not
	// just their own entries. Otherwise large node_modules trees still hash
	// into the final delta and excluded children can enter deletion manifests.
	return `\\( ${matches} \\) -prune -o`;
}

/** Record the source tree before the baseline tar is built. */
export async function prepareLiveBaseline(
	handle: MoveSource,
	migrationId: string,
	plan: StateMovePlan,
): Promise<LiveBaseline> {
	assertPlanPaths(plan);
	const id = safeToken(migrationId, "migration id");
	const markerPath = `/tmp/am-live-${id}.marker`;
	const baselineListPath = `/tmp/am-live-${id}.baseline`;
	const paths = plan.include.map(shq).join(" ");
	const findExcludes = findExcludeExpression(plan.exclude);
	const command = [
		`set -e -o pipefail`,
		`touch ${shq(markerPath)}`,
		`(cd "$HOME" && for am_path in ${paths}; do [ -e "$am_path" ] || exit 66; find "$am_path" -xdev ${findExcludes} -print0 || exit $?; done | LC_ALL=C sort -z -u) > ${shq(baselineListPath)}`,
		`echo AM_LIVE_BASELINE_READY`,
	].join("\n");
	const result = await handle.exec(command, { timeoutMs: DEFAULT_TAR_TIMEOUT_MS });
	if (result.exitCode !== 0 || !result.stdout.includes("AM_LIVE_BASELINE_READY")) {
		throw new MuxError(
			"transient",
			`could not record the live-migration baseline (exit ${result.exitCode}): ${(result.stderr || result.stdout).trim().slice(-400)}`,
		);
	}
	return {
		migrationId: id,
		markerPath,
		baselineListPath,
		include: [...plan.include],
		exclude: [...plan.exclude],
	};
}

function fingerprintCommand(baseline: LiveBaseline): string {
	const paths = baseline.include.map(shq).join(" ");
	const excludes = baseline.exclude.map((pattern) => `--exclude=${shq(pattern)}`).join(" ");
	const findExcludes = findExcludeExpression(baseline.exclude);
	return [
		`set -o pipefail`,
		`(cd "$HOME" && for am_path in ${paths}; do if [ -e "$am_path" ]; then find "$am_path" -xdev ${findExcludes} -print0 || exit $?; fi; done | LC_ALL=C sort -z -u | tar -cf - --null --no-recursion ${excludes} -T - 2>/dev/null) | sha256sum`,
	].join("\n");
}

async function fingerprint(handle: MoveSource, baseline: LiveBaseline): Promise<string> {
	const result = await handle.exec(fingerprintCommand(baseline), {
		timeoutMs: DEFAULT_TAR_TIMEOUT_MS,
	});
	const digest = /^[0-9a-f]{64}/.exec(result.stdout.trim())?.[0];
	if (result.exitCode !== 0 || !digest) {
		throw new MuxError("transient", "could not fingerprint live-migration state");
	}
	return digest;
}

export type StableLiveDelta = {
	exported: ExportedTar;
	deleteManifest: string;
	bytes: number;
	stabilityAttempts: number;
};

/**
 * Build a delta against the baseline and prove the allowlisted state did not
 * change across that build. A changing tree retries from scratch; after the
 * bounded attempts it fails toward the still-addressable source.
 */
export async function exportStableLiveDelta(
	handle: MoveSource,
	baseline: LiveBaseline,
	options: { attempts?: number } = {},
): Promise<StableLiveDelta> {
	const attempts = options.attempts ?? DEFAULT_STABILITY_ATTEMPTS;
	const id = safeToken(baseline.migrationId, "migration id");
	const currentPath = `/tmp/am-live-${id}.current`;
	const changedPath = `/tmp/am-live-${id}.changed`;
	const deletedPath = `/tmp/am-live-${id}.deleted`;
	const tarPath = `/tmp/am-live-${id}.delta.tgz`;
	const deleteManifest = `.agent-machines/.migration-deletions-${id}`;
	const paths = baseline.include.map(shq).join(" ");
	const excludes = baseline.exclude
		.map((pattern) => `--exclude=${shq(pattern)}`)
		.join(" ");
	const findExcludes = findExcludeExpression(baseline.exclude);

	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		const before = await fingerprint(handle, baseline);
		const build = [
			`set -e -o pipefail`,
			`mkdir -p "$HOME/.agent-machines"`,
			`(cd "$HOME" && for am_path in ${paths}; do if [ -e "$am_path" ]; then find "$am_path" -xdev ${findExcludes} -print0 || exit $?; fi; done | LC_ALL=C sort -z -u) > ${shq(currentPath)}`,
			// Deepest paths first: replay can remove children before attempting
			// rmdir on parents, while excluded/re-derived files keep their parent.
			`comm -z -23 ${shq(baseline.baselineListPath)} ${shq(currentPath)} | LC_ALL=C sort -zr > ${shq(deletedPath)}`,
			`cp ${shq(deletedPath)} "$HOME/${deleteManifest}"`,
			`(cd "$HOME" && for am_path in ${paths}; do if [ -e "$am_path" ]; then find "$am_path" -xdev ${findExcludes} \\( -newer ${shq(baseline.markerPath)} -o -cnewer ${shq(baseline.markerPath)} \\) -print0 || exit $?; fi; done | LC_ALL=C sort -z -u) > ${shq(changedPath)}`,
			`printf '%s\\0' ${shq(deleteManifest)} >> ${shq(changedPath)}`,
			`tar -C "$HOME" -czf ${shq(tarPath)} --null --no-recursion ${excludes} -T ${shq(changedPath)}`,
			`echo AM_LIVE_DELTA_READY`,
		].join("\n");
		const built = await handle.exec(build, { timeoutMs: DEFAULT_TAR_TIMEOUT_MS });
		if (built.exitCode !== 0 || !built.stdout.includes("AM_LIVE_DELTA_READY")) {
			throw new MuxError(
				"transient",
				`could not build the live-migration delta (exit ${built.exitCode}): ${(built.stderr || built.stdout).trim().slice(-400)}`,
			);
		}
		const exported = await exportTar(handle, tarPath);
		const after = await fingerprint(handle, baseline);
		if (before === after) {
			return {
				exported,
				deleteManifest,
				bytes: exported.bytes.length,
				stabilityAttempts: attempt,
			};
		}
	}
	throw new MuxError(
		"transient",
		`allowlisted state kept changing through ${attempts} final-delta attempts; refusing an inconsistent live cutover`,
	);
}

function allowedDeletePatterns(include: readonly string[]): string {
	return include.flatMap((path) => [path, `${path}/*`]).join("|");
}

function blockedDeletePatterns(exclude: readonly string[]): string {
	return exclude
		.flatMap((pattern) => [pattern, `${pattern}/*`, `*/${pattern}`, `*/${pattern}/*`])
		.join("|");
}

/** Restore a stable delta, then apply its source-authored deletion manifest. */
export async function restoreStableLiveDelta(
	handle: MoveTarget,
	delta: StableLiveDelta,
	options: RestoreOptions & { include: readonly string[]; exclude: readonly string[] },
): Promise<void> {
	assertPlanPaths({ include: [...options.include], exclude: [...options.exclude] });
	await restoreTar(handle, delta.exported.bytes, options);
	const allowed = allowedDeletePatterns(options.include);
	const blocked = blockedDeletePatterns(options.exclude);
	const command = [
		`set -e`,
		`am_delete_manifest="$HOME/${delta.deleteManifest}"`,
		`if [ -f "$am_delete_manifest" ]; then`,
		`  while IFS= read -r -d '' am_path; do`,
		`    case "$am_path" in`,
		`      ${allowed}) ;;`,
		`      *) echo "AM_LIVE_UNSAFE_DELETE $am_path" >&2; exit 66 ;;`,
		`    esac`,
		...(blocked
			? [
					`    case "$am_path" in ${blocked}) echo "AM_LIVE_EXCLUDED_DELETE $am_path" >&2; exit 66 ;; esac`,
				]
			: []),
		`    case "$am_path" in /*|../*|*/../*|*/..) echo "AM_LIVE_UNSAFE_DELETE $am_path" >&2; exit 66 ;; esac`,
		`    am_home_real=$(realpath -m -- "$HOME")`,
		`    am_parent_real=$(realpath -m -- "$(dirname -- "$HOME/$am_path")")`,
		`    case "$am_parent_real" in "$am_home_real"|"$am_home_real"/*) ;; *) echo "AM_LIVE_UNSAFE_PARENT $am_path" >&2; exit 66 ;; esac`,
		`    if [ -d "$HOME/$am_path" ] && [ ! -L "$HOME/$am_path" ]; then`,
		`      rmdir --ignore-fail-on-non-empty -- "$HOME/$am_path" 2>/dev/null || true`,
		`    else`,
		`      rm -f -- "$HOME/$am_path"`,
		`    fi`,
		`  done < "$am_delete_manifest"`,
		`  rm -f "$am_delete_manifest"`,
		`fi`,
		`echo AM_LIVE_DELTA_APPLIED`,
	].join("\n");
	const result = await handle.exec(command, {
		timeoutMs: options.timeoutMs ?? DEFAULT_TAR_TIMEOUT_MS,
	});
	if (result.exitCode !== 0 || !result.stdout.includes("AM_LIVE_DELTA_APPLIED")) {
		throw new MuxError(
			result.exitCode === 66 ? "fatal" : "transient",
			`live-migration deletion replay failed (exit ${result.exitCode}): ${(result.stderr || result.stdout).trim().slice(-400)}`,
		);
	}
}

export async function cleanupLiveMigration(
	handle: MoveSource,
	baseline: LiveBaseline,
): Promise<void> {
	const id = safeToken(baseline.migrationId, "migration id");
	await handle
		.exec(
			`rm -f ${shq(baseline.markerPath)} ${shq(baseline.baselineListPath)} /tmp/am-live-${id}.current /tmp/am-live-${id}.changed /tmp/am-live-${id}.deleted /tmp/am-live-${id}.delta.tgz "$HOME/.agent-machines/.migration-deletions-${id}"`,
			{ timeoutMs: 30_000 },
		)
		.catch(() => undefined);
}
