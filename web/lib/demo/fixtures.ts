/**
 * Fleet-level demo fixtures — resolved from demo-config.json via config.ts.
 */

import type { MachineRef } from "@/lib/user-config/schema";

import {
	getDemoCronRunsConfig,
	getDemoGatewayConfig,
	getDemoMetricsSummaryConfig,
	getDemoSeedMachines,
	getDemoUsageConfig,
} from "./config";

export const DEMO_BASE_MACHINES: MachineRef[] = getDemoSeedMachines();

export const DEMO_GATEWAY = getDemoGatewayConfig();

export const DEMO_METRICS_SUMMARY = getDemoMetricsSummaryConfig();

export const DEMO_USAGE = getDemoUsageConfig();

export type DemoCronRun = {
	name: string;
	schedule: string;
	lastRunAt: string;
	status: "success" | "running" | "failed";
	costUsd: number;
	summary: string;
};

export const DEMO_CRON_RUNS = getDemoCronRunsConfig() as DemoCronRun[];
