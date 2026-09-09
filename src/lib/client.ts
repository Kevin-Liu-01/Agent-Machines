/**
 * Dedalus client factory + machine state persistence.
 *
 * State (machine ID, API server token, preview URLs) lives in `.machine-state.json`
 * at the repo root, gitignored. This is what makes the CLI feel persistent --
 * `npm run chat` knows which machine to talk to without re-deploying.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type Dedalus from "dedalus";

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

export function makeClient(_config: Config): Dedalus {
	throw new Error("The legacy provider has been retired. Use 'am mux help' for Daytona, E2B, Sprites, and Vercel. Existing machine records have not been moved or deleted.");
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
