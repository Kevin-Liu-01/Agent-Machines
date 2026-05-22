"use client";

import { useMachineControl } from "@/lib/dashboard/use-machine-control";
import { useScopedMachineId } from "@/lib/dashboard/use-scoped-machine-id";
import type { PublicMachineRef } from "@/lib/user-config/schema";

/**
 * Renders nothing. Mounted in the dashboard layout so any /dashboard/*
 * page auto-wakes the machine in focus (URL-scoped or active).
 */
export function AutoWake({
	machines,
	activeMachineId,
}: {
	machines: PublicMachineRef[];
	activeMachineId: string | null;
}) {
	const scopedId = useScopedMachineId(machines, activeMachineId);
	useMachineControl(scopedId);
	return null;
}
