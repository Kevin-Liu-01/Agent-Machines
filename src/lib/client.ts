/**
 * Dedalus client factory + machine state persistence.
 *
 * State (machine ID, API server token, preview URLs) lives in `.machine-state.json`
 * at the repo root, gitignored. This is what makes the CLI feel persistent --
 * `npm run chat` knows which machine to talk to without re-deploying.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import Dedalus from "dedalus";

import { STATE_FILE } from "./constants.js";
import type { Config } from "./env.js";

export type MachineState = {
	machineId: string;
	apiServerKey: string;
	apiPreviewUrl?: string;
	dashboardPreviewUrl?: string;
	deployedAt: string;
	deployVersion: string;
	model: string;
};

export function makeClient(config: Config): Dedalus {
	return new Dedalus({
		xAPIKey: config.apiKey,
		baseURL: config.machinesBaseUrl,
	});
}

function statePath(): string {
	return resolve(process.cwd(), STATE_FILE);
}

export function loadState(): MachineState | null {
	const path = statePath();
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf8")) as MachineState;
	} catch {
		return null;
	}
}

export function saveState(state: MachineState): void {
	writeFileSync(statePath(), JSON.stringify(state, null, 2));
}

export function clearState(): void {
	const path = statePath();
	if (existsSync(path)) {
		writeFileSync(path, "{}");
	}
}
