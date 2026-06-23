import { describe, expect, it } from "vitest";

import {
	type AgentMachineCandidate,
	bestMachineForAgent,
	selectAgentMachine,
} from "./agent-switching";

function machine(
	id: string,
	agentKind: AgentMachineCandidate["agentKind"],
	patch: Partial<AgentMachineCandidate> = {},
): AgentMachineCandidate {
	return { id, agentKind, ...patch };
}

describe("selectAgentMachine", () => {
	it("invariant_stale_visible_list_falls_back_to_live_catalog", () => {
		const target = selectAgentMachine({
			knownMachines: [machine("hermes-1", "hermes")],
			catalogMachines: [
				machine("openclaw-live", "openclaw", {
					apiUrl: "https://openclaw.example/v1",
					bootstrapState: { phase: "succeeded", lastError: null },
					live: { ok: true, state: "ready" },
				}),
			],
			agentKind: "openclaw",
			currentMachineId: "hermes-1",
		});

		expect(target?.id).toBe("openclaw-live");
	});

	it("invariant_archived_agent_machines_are_not_switch_targets", () => {
		const target = bestMachineForAgent(
			[
				machine("old-openclaw", "openclaw", { archived: true }),
				machine("new-openclaw", "openclaw"),
			],
			"openclaw",
		);

		expect(target?.id).toBe("new-openclaw");
	});

	it("invariant_switching_prefers_a_different_machine_for_the_agent", () => {
		const target = bestMachineForAgent(
			[
				machine("current-codex", "codex", {
					apiUrl: "https://codex-current.example/v1",
					bootstrapState: { phase: "succeeded", lastError: null },
					live: { ok: true, state: "ready" },
				}),
				machine("other-codex", "codex"),
			],
			"codex",
			"current-codex",
		);

		expect(target?.id).toBe("other-codex");
	});

	it("invariant_ready_reachable_booted_machine_wins", () => {
		const target = bestMachineForAgent(
			[
				machine("stale-openclaw", "openclaw"),
				machine("ready-openclaw", "openclaw", {
					apiUrl: "https://openclaw.example/v1",
					bootstrapState: { phase: "succeeded", lastError: null },
					live: { ok: true, state: "ready" },
				}),
			],
			"openclaw",
		);

		expect(target?.id).toBe("ready-openclaw");
	});
});
