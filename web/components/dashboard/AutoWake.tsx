"use client";

import { useMachineControl } from "@/lib/dashboard/use-machine-control";

/**
 * Renders nothing. Mounted in the dashboard layout so any /dashboard/*
 * page auto-wakes the container on entry.
 */
export function AutoWake() {
	useMachineControl();
	return null;
}
