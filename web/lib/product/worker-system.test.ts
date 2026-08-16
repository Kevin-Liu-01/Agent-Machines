import { describe, expect, it } from "vitest";

import { WORKER_SYSTEM } from "./worker-system";

describe("Worker system product contract", () => {
	it("keeps the Worker durable while primitives remain replaceable", () => {
		expect(WORKER_SYSTEM.thesis).toBe(
			"The Worker is durable. Everything underneath is replaceable.",
		);
		expect(WORKER_SYSTEM.durable).toContain("identity");
		expect(WORKER_SYSTEM.durable).toContain("evidence");
		expect(WORKER_SYSTEM.replaceable.map((item) => item.id)).toEqual(
			expect.arrayContaining(["runtime", "model", "sandbox", "abilities", "router"]),
		);
	});

	it("expresses routing, creation, and accessible first use as separate layers", () => {
		expect(WORKER_SYSTEM.layers.map((layer) => layer.id)).toEqual([
			"route",
			"compose",
			"access",
		]);
		expect(WORKER_SYSTEM.flow).toHaveLength(4);
		expect(new Set(WORKER_SYSTEM.specialists).size).toBe(
			WORKER_SYSTEM.specialists.length,
		);
	});
});
