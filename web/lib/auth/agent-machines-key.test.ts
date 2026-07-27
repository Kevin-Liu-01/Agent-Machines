import { describe, expect, it } from "vitest";

import {
	agentMachinesApiKeyMatches,
	createAgentMachinesApiKey,
	userIdFromAgentMachinesApiKey,
} from "./agent-machines-key";

describe("Agent Machines API keys", () => {
	it("issues an opaque key that resolves to its owner and verifies by hash", () => {
		const { token, record } = createAgentMachinesApiKey("user_abc-123");
		expect(token).toMatch(/^am_live_/);
		expect(userIdFromAgentMachinesApiKey(token)).toBe("user_abc-123");
		expect(agentMachinesApiKeyMatches(token, record)).toBe(true);
		expect(agentMachinesApiKeyMatches(`${token}x`, record)).toBe(false);
		expect(record.hash).not.toContain(token);
	});

	it("rejects malformed and non-Agent-Machines tokens", () => {
		expect(userIdFromAgentMachinesApiKey("sk_test_123")).toBeNull();
		expect(userIdFromAgentMachinesApiKey("am_live_bad.short")).toBeNull();
	});
});
