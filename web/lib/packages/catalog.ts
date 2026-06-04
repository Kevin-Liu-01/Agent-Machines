/**
 * Load session attach packages from synced `web/data/packages.json`.
 */

import packagesData from "@/data/packages.json";

import type { AbilityPackage } from "./types";

type PackagesShape = { packages: AbilityPackage[] };

const DATA = (packagesData as PackagesShape) ?? { packages: [] };

export function listPackages(): AbilityPackage[] {
	return [...(DATA.packages ?? [])];
}

export function findPackage(id: string): AbilityPackage | null {
	return listPackages().find((p) => p.id === id) ?? null;
}
