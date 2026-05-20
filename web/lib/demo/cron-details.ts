/**
 * Per-cron drill-down — resolved from demo-config.json via config.ts.
 */

import type { CronRunDetail } from "@/lib/dashboard/types";

import { getDemoCronDetailConfig, listDemoCronDetailNames } from "./config";

export function getCronRunDetail(name: string): CronRunDetail | null {
	return getDemoCronDetailConfig(name);
}

export function listCronDetailNames(): string[] {
	return listDemoCronDetailNames();
}
