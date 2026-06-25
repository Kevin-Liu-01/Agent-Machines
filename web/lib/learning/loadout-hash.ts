/**
 * Stable content hash of a machine's active loadout (its resolved skills/tools/
 * MCPs). Recorded on every trace so routing can later be analyzed per loadout.
 *
 * Machines don't reference a memory bundle directly -- the link is via the Worker
 * last deployed to the machine (Worker.lastMachineId -> Worker.memoryBundleId).
 *
 * `Pool` is imported as a type only (erased at runtime) so this module stays
 * unit-testable without the generated skills catalog; callers pass a built pool.
 */

import { createHash } from "node:crypto";

import { resolveAbilities } from "@/lib/memory/abilities";
import { defaultMemoryBundle, resolveBundle } from "@/lib/memory/bundle";
import type { Pool } from "@/lib/dashboard/pool";
import type { MemoryBundle, UserConfig } from "@/lib/user-config/schema";

/** sha256 (truncated) of a bundle's resolved abilities against a pool. */
export function computeLoadoutHash(bundle: MemoryBundle, pool: Pool): string {
	const resolved = resolveAbilities(bundle, pool);
	const canonical = {
		skills: resolved.skills.map((a) => a.id).sort(),
		tools: resolved.tools.map((a) => a.id).sort(),
		mcps: resolved.mcps.map((a) => a.id).sort(),
	};
	return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 16);
}

/**
 * The memory bundle for a machine: the bundle of the worker last deployed there,
 * falling back to the default bundle when no worker maps to it.
 */
export function bundleForMachine(config: UserConfig, machineId: string): MemoryBundle {
	const worker = (config.workers ?? []).find((w) => w.lastMachineId === machineId);
	return (worker ? resolveBundle(config, worker.memoryBundleId) : null) ?? defaultMemoryBundle();
}
