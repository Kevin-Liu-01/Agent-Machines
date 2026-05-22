"use client";

import { usePathname } from "next/navigation";

import type { PublicMachineRef } from "@/lib/user-config/schema";

const MACHINE_PATH_RE = /^\/dashboard\/machines\/([^/]+)/;

/**
 * Machine id the dashboard should treat as "in focus" for polling,
 * wake, gateway probes, and chat. URL-scoped machine routes win over
 * the account's stored activeMachineId so fleet split / drill-down
 * doesn't lie about which VM you're looking at.
 */
export function useScopedMachineId(
	machines: PublicMachineRef[] | undefined,
	activeMachineId: string | null | undefined,
): string | null {
	const pathname = usePathname();
	const match = MACHINE_PATH_RE.exec(pathname);
	if (match) {
		const fromUrl = machines?.find((m) => m.id === match[1]);
		if (fromUrl) return fromUrl.id;
	}
	return activeMachineId ?? null;
}
