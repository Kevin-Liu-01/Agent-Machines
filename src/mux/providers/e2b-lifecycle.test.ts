import assert from "node:assert/strict";
import { test } from "node:test";
import { createE2bProvider, type E2bSdk } from "./e2b.js";

test("E2B worker timeout pauses durable state instead of deleting its filesystem", async () => {
	const calls: Record<string, unknown>[] = [];
	const sdk = { Sandbox: { create: async (options: Record<string, unknown>) => {
		calls.push(options);
		return { sandboxId: "durable-worker" };
	} } } as unknown as E2bSdk;
	const provider = createE2bProvider({ apiKey: "fixture-key" }, sdk);
	await provider.create({ name: "durable", timeoutMs: 3_600_000, env: { HOME: "/home/user" } });
	assert.deepEqual(calls[0]?.lifecycle, { onTimeout: "pause", autoResume: false });
	assert.equal(calls[0]?.timeoutMs, 3_600_000);
	assert.deepEqual(calls[0]?.envs, { HOME: "/home/user" });
});

test("default and short SDK timeouts retain the same explicit pause policy", async () => {
	const calls: Record<string, unknown>[] = [];
	const sdk = { Sandbox: { create: async (options: Record<string, unknown>) => {
		calls.push(options);
		return { sandboxId: "durable-worker" };
	} } } as unknown as E2bSdk;
	const provider = createE2bProvider({ apiKey: "fixture-key" }, sdk);
	await provider.create(); await provider.create({ timeoutMs: 1_000 });
	assert.deepEqual(calls.map((call) => call.lifecycle), [
		{ onTimeout: "pause", autoResume: false },
		{ onTimeout: "pause", autoResume: false },
	]);
	assert.deepEqual(calls.map((call) => call.timeoutMs), [300_000, 1_000]);
});

test("E2B sizing remains template-defined and create does not pass ignored resource fields", async () => {
	const calls: Record<string, unknown>[] = [];
	const sdk = { Sandbox: {
		create: async (options: Record<string, unknown>) => { calls.push(options); return { sandboxId: "template-worker" }; },
		getInfo: async () => ({ state: "paused", cpuCount: 2, memoryMB: 512 }),
		connect: async () => { assert.fail("describe must not wake the sandbox"); },
	} } as unknown as E2bSdk;
	const provider = createE2bProvider({ apiKey: "fixture-key" }, sdk);
	await provider.create({ template: "existing-template", resources: { vcpu: 1, memoryMib: 2048, diskGib: 10 } });
	assert.equal(calls[0]?.template, "existing-template");
	assert.equal("cpuCount" in calls[0]!, false);
	assert.equal("memoryMB" in calls[0]!, false);
	assert.equal(provider.capabilities.limits?.resourceRequest, "unsupported");
	const description = await provider.describe!("template-worker");
	assert.deepEqual(description.resources, { vcpu: 2, memoryMib: 512 });
	assert.equal(description.state, "sleeping");
});
