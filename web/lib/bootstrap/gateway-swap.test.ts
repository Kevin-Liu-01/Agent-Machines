/**
 * The agent-swap correctness fixes in runner.ts, tested at the exported
 * command builders (the runner itself needs a live sandbox; the commands are
 * the contract):
 *
 *  - killAllGatewaysCommand must name BOTH gateway patterns. Killing only the
 *    new agentKind's pattern leaves the old agent's gateway running: on
 *    sprites both agents bind 8080 so the port probe returns a FALSE ready
 *    from the old gateway; on e2b/vercel the ports differ so the old gateway
 *    double-runs instead.
 *  - gatewayReadyProbeCommand must require the NEW agent's own process
 *    pattern in addition to the listening port -- a bare `ss | grep :port`
 *    cannot tell whose gateway answered.
 *  - terminalAgentRewriteCommand must rewrite desiredAgentKind (tmux restore
 *    relaunches the REMEMBERED agent, stale after a swap) without clobbering
 *    the rest of the state file.
 */

import { describe, expect, it } from "vitest";

import {
	GATEWAY_KILL_PATTERNS,
	gatewayReadyProbeCommand,
	killAllGatewaysCommand,
	terminalAgentRewriteCommand,
} from "@/lib/bootstrap/runner";

describe("killAllGatewaysCommand", () => {
	it("names BOTH gateway patterns, not just one agent's", () => {
		const cmd = killAllGatewaysCommand();
		expect(cmd).toContain("openclaw gateway run");
		expect(cmd).toContain("hermes gateway");
	});

	it("the pattern list itself covers both agents (the constant the kill is built from)", () => {
		expect(GATEWAY_KILL_PATTERNS).toContain("openclaw gateway run");
		expect(GATEWAY_KILL_PATTERNS).toContain("hermes gateway");
	});

	it("kills by pid and never fails the enclosing set -e script", () => {
		const cmd = killAllGatewaysCommand();
		expect(cmd).toContain("xargs -r kill");
		expect(cmd).toMatch(/\|\| true$/);
	});
});

describe("gatewayReadyProbeCommand", () => {
	it("requires the port AND the new agent's own process pattern", () => {
		const cmd = gatewayReadyProbeCommand(8080, "openclaw gateway run");
		// Port check alone is the sprites-8080 false-ready trap.
		expect(cmd).toContain(':8080 "');
		expect(cmd).toContain("grep -F 'openclaw gateway run'");
		// Both checks are AND-ed before "ready" can print.
		const readyIdx = cmd.indexOf("echo ready");
		expect(cmd.indexOf("ss -ltn")).toBeLessThan(readyIdx);
		expect(cmd.indexOf("grep -F")).toBeLessThan(readyIdx);
	});

	it("answers waiting, never a hard failure, when the gateway is down", () => {
		expect(gatewayReadyProbeCommand(8642, "hermes gateway")).toMatch(/echo waiting$/);
	});
});

describe("terminalAgentRewriteCommand", () => {
	it("rewrites desiredAgentKind to the machine's agent", () => {
		const cmd = terminalAgentRewriteCommand("openclaw", "/home/sprite/.agent-machines");
		expect(cmd).toContain('"desiredAgentKind":"openclaw"');
		expect(cmd).toContain("/home/sprite/.agent-machines/state/terminal-agent.json");
	});

	it("is a no-op when the state file does not exist (fresh box)", () => {
		const cmd = terminalAgentRewriteCommand("codex", "/home/user/.agent-machines");
		expect(cmd).toMatch(/^if \[ -f /);
		expect(cmd).toMatch(/fi$/);
	});

	it("uses sed-to-temp-then-mv, never sed -i (BSD/GNU disagree on -i)", () => {
		const cmd = terminalAgentRewriteCommand("hermes", "/home/user/.agent-machines");
		expect(cmd).not.toContain("sed -i");
		expect(cmd).toContain("&& mv ");
	});
});
