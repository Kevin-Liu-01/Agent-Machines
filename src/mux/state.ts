/**
 * Shared machine state for the mux.
 *
 * Named machines are remembered in ~/.agent-machines/mux-state.json so
 * `mux.connect("name")` works across processes, shells and surfaces
 * (SDK, CLI, local dev server) regardless of which substrate the router
 * placed the machine on. This is deliberately a small local file, not a
 * daemon: the substrate vendors already persist the sandboxes
 * themselves; we only need to remember where we put things.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { HarnessKind, SubstrateKind } from "./types.js";

export type RememberedMachine = {
	substrate: SubstrateKind;
	sandboxId: string;
	agent: HarnessKind;
	updatedAt: string;
};

export type MuxState = {
	machines: Record<string, RememberedMachine>;
};

function statePath(): string {
	return (
		process.env.AGENT_MACHINES_MUX_STATE ??
		join(homedir(), ".agent-machines", "mux-state.json")
	);
}

export function readMuxState(): MuxState {
	try {
		const raw = readFileSync(statePath(), "utf8");
		const parsed = JSON.parse(raw) as MuxState;
		return { machines: parsed.machines ?? {} };
	} catch {
		return { machines: {} };
	}
}

function writeMuxState(state: MuxState): void {
	const path = statePath();
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function rememberMachine(
	name: string,
	machine: Omit<RememberedMachine, "updatedAt">,
): void {
	const state = readMuxState();
	state.machines[name] = { ...machine, updatedAt: new Date().toISOString() };
	writeMuxState(state);
}

export function forgetMachine(name: string): void {
	const state = readMuxState();
	if (name in state.machines) {
		delete state.machines[name];
		writeMuxState(state);
	}
}
