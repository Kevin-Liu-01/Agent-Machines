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
import type { SubstrateHealthSnapshot } from "./health.js";
import type { HarnessKind, SubstrateKind } from "./types.js";

export type RememberedMachine = {
	substrate: SubstrateKind;
	sandboxId: string;
	agent: HarnessKind;
	updatedAt: string;
};

export type MuxState = {
	machines: Record<string, RememberedMachine>;
	/**
	 * Circuit-breaker samples, so a substrate that is failing stays
	 * de-prioritized for the next process too. Optional because older state
	 * files predate it and a missing breaker must degrade to "assume
	 * healthy", never to a crash.
	 */
	health?: SubstrateHealthSnapshot;
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
		return { machines: parsed.machines ?? {}, health: parsed.health };
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

/**
 * Persist the circuit-breaker snapshot.
 *
 * Read-modify-write like the machine writers above, so a health save keeps
 * whatever machines another process recorded. Cross-process health samples
 * are still last-writer-wins: two processes probing different substrates
 * concurrently can lose one another's samples. That is acceptable for a
 * breaker (it re-learns from the next outcome, and losing a sample only
 * delays opening a circuit) and is not acceptable for machines, which is
 * why those have their own writers.
 */
export function saveHealth(snapshot: SubstrateHealthSnapshot): void {
	const state = readMuxState();
	state.health = snapshot;
	writeMuxState(state);
}
