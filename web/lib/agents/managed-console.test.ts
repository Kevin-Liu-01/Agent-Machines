import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_CONFIG, type MachineRef } from "@/lib/user-config/schema";

const mocks = vi.hoisted(() => ({
	user: vi.fn(), config: vi.fn(), submit: vi.fn(), run: vi.fn(), reconcile: vi.fn(),
	getOperation: vi.fn(), state: vi.fn(), artifacts: vi.fn(), save: vi.fn(), load: vi.fn(), inject: vi.fn(), after: vi.fn(),
}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/user-config/identity", () => ({ getEffectiveUserId: mocks.user }));
vi.mock("@/lib/user-config/clerk", () => ({ getUserConfig: mocks.config }));
vi.mock("@/lib/control-plane/adopt-machine", () => ({ submitMachineIntent: mocks.submit }));
vi.mock("@/lib/dashboard/exec", () => ({ resolveMachine: (config: { machines: MachineRef[] }, id: string) => config.machines.find((m) => m.id === id) }));
vi.mock("@/lib/providers", () => ({ getProvider: () => ({ state: mocks.state }) }));
vi.mock("@/lib/bootstrap/bootstrap-repair", () => ({ agentArtifactsPresent: mocks.artifacts }));
vi.mock("@/lib/storage/machine-chats", () => ({ saveChat: mocks.save, loadChat: mocks.load }));
vi.mock("@/lib/storage/machine-fs", () => ({ storageContextFor: (machine: MachineRef) => ({ machineId: machine.id, appDataRoot: "/home/user/.agent-machines" }) }));
vi.mock("@/lib/dashboard/pool", () => ({ buildPool: () => ({}) }));
vi.mock("@/lib/packages/inject", () => ({ injectSessionAbilities: mocks.inject }));

import { POST } from "@/app/api/chat/route";
import { GET, POST as runPost } from "@/app/api/agents/run/route";
import { processAgentEvent, readSseStream } from "@/lib/agents/parser";
import { createStreamAccumulator } from "@/lib/agents/protocol";

function request(body: unknown) {
	return new Request("https://agent-machines.test/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
function setup(agentKind = "claude-code") {
	const machine = { id: "tenant-machine", agentKind, providerKind: "e2b", model: "claude-opus-4-8", bootstrapState: { phase: "succeeded" } } as MachineRef;
	mocks.config.mockResolvedValue({ ...structuredClone(DEFAULT_USER_CONFIG), machines: [machine] });
	mocks.submit.mockResolvedValue({
		machine,
		accepted: { worker: { id: "durable-worker", spec: { runtime: agentKind, model: machine.model } }, operation: { id: "lifecycle", status: "succeeded" } },
		controlPlane: { run: mocks.run, reconcileNext: mocks.reconcile, store: { getOperation: mocks.getOperation } },
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.user.mockResolvedValue("tenant-user");
	mocks.state.mockResolvedValue({ state: "ready" });
	mocks.artifacts.mockResolvedValue(true);
	mocks.load.mockResolvedValue(null);
	mocks.inject.mockImplementation((text: string, ids: string[]) => ids.length ? `attached: ${ids.join(",")}\n${text}` : text);
	mocks.run.mockResolvedValue({ id: "journal-run", status: "queued" });
	mocks.reconcile.mockResolvedValue({ operation: { id: "journal-run", status: "succeeded", result: { text: "Created proof.txt", exitCode: 0, events: [
		{ type: "tool_call", id: "tool1", name: "Bash", input: '{"command":"printf proof > proof.txt"}' },
		{ type: "tool_result", id: "tool1", output: "" },
		{ type: "result", text: "Created proof.txt" },
	] } } });
	setup();
});

describe("managed runtime Console", () => {
	it.each(["claude-code", "codex", "openclaw", "hermes"])("runs %s inside the selected Worker without an HTTP gateway", async (runtime) => {
		setup(runtime);
		const response = await POST(request({ machineId: "tenant-machine", messages: [{ role: "user", content: "Create proof.txt" }] }));
		expect(response.status).toBe(200);
		const stream = await response.text();
		expect(mocks.submit).toHaveBeenCalledWith("tenant-user", "tenant-machine", { desiredState: "running", executionDeadlineMs: expect.any(Number) });
		expect(mocks.run).toHaveBeenCalledWith("durable-worker", "Create proof.txt", expect.any(String));
		expect(stream).toContain("Created proof.txt");
		expect(stream).toContain("tool.start");
		expect(stream).toContain("journal-run");
		expect(stream).toContain("[DONE]");
	});

	it("passes all conversation roles and attached abilities to the actual runtime", async () => {
		const response = await POST(request({ machineId: "tenant-machine", sessionPackageIds: ["research"], messages: [
			{ role: "system", content: "Verify your evidence." }, { role: "user", content: "Use filename proof.txt" },
			{ role: "assistant", content: "I will use proof.txt." }, { role: "user", content: "Now write it." },
		] }));
		await response.text();
		const prompt = mocks.run.mock.calls[0][1];
		for (const value of ["Verify your evidence.", "Use filename proof.txt", "I will use proof.txt.", "Now write it.", "attached: research", '"role":"assistant"']) expect(prompt).toContain(value);
	});

	it("rejects another account's machine before dispatching work", async () => {
		const response = await POST(request({ machineId: "someone-elses-machine", messages: [{ role: "user", content: "run" }] }));
		expect(response.status).toBe(404);
		expect(mocks.submit).not.toHaveBeenCalled();
	});

	it("returns a failed run as an error event, not a successful answer", async () => {
		mocks.reconcile.mockResolvedValue({ operation: { id: "journal-run", status: "failed", error: "Native credential rejected" } });
		const stream = await (await POST(request({ machineId: "tenant-machine", messages: [{ role: "user", content: "run" }] }))).text();
		expect(stream).toContain("event: error");
		expect(stream).toContain("Native credential rejected");
	});

	it.each([null, { messages: [null] }, { messages: [{ role: "user", content: 17 }] }])("rejects malformed input without dispatch", async (body) => {
		expect((await POST(request(body))).status).toBe(400);
		expect(mocks.submit).not.toHaveBeenCalled();
	});

	it("uses the same full-history path for /api/agents/run", async () => {
		const response = await runPost(request({ machineId: "tenant-machine", messages: [{ role: "user", content: "Remember alpha" }, { role: "assistant", content: "Remembered" }, { role: "user", content: "Use it" }] }));
		expect(response.status).toBe(200);
		expect(mocks.run.mock.calls[0][1]).toContain("Remember alpha");
	});

	it("probes runtime artifacts on the actual machine before reporting ready", async () => {
		const response = await GET(new Request("https://agent-machines.test/api/agents/run?machineId=tenant-machine"));
		expect((await response.json()).ok).toBe(true);
		expect(mocks.artifacts).toHaveBeenCalledWith(expect.objectContaining({ id: "tenant-machine" }), expect.any(Object));
		mocks.artifacts.mockResolvedValue(false);
		expect((await (await GET(new Request("https://agent-machines.test/api/agents/run?machineId=tenant-machine"))).json()).ok).toBe(false);
	});

	it("preserves earlier operation/tool evidence when the next turn is saved", async () => {
		const earlierEvents = [{ kind: "shell_exec", id: "old-tool", command: "ls", stdout: "proof.txt", exitCode: 0, status: "completed", startedAt: 1 }];
		mocks.load.mockResolvedValue({ messages: [{ id: "old-answer", role: "assistant", content: "Found proof.txt", operationId: "old-operation", agentEvents: earlierEvents }] });
		await (await POST(request({ machineId: "tenant-machine", conversationId: "conversation-1", assistantTurnId: "new-answer", messages: [
			{ id: "first", role: "user", content: "Find my file" }, { id: "old-answer", role: "assistant", content: "Found proof.txt" }, { id: "next", role: "user", content: "Read it" },
		] }))).text();
		const [saved, storage] = mocks.save.mock.calls.at(-1)!;
		expect(storage.machineId).toBe("tenant-machine");
		expect(saved.messages[1]).toMatchObject({ operationId: "old-operation", agentEvents: earlierEvents });
		expect(saved.messages.at(-1)).toMatchObject({ id: "new-answer", content: "Created proof.txt", operationId: "journal-run" });
		expect(saved.messages.at(-1).agentEvents).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "shell_exec", command: "printf proof > proof.txt", status: "completed" })]));
	});

	it("continues the bounded run and saves its result after the viewer disconnects", async () => {
		let finish!: (value: unknown) => void;
		const outcome = await mocks.reconcile();
		mocks.reconcile.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
		const response = await POST(request({ machineId: "tenant-machine", conversationId: "disconnect-chat", messages: [{ role: "user", content: "Create proof.txt" }] }));
		await response.body!.cancel();
		// Wait for the persisted operation to reach provider execution.
		await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
		finish(outcome);
		await mocks.after.mock.calls[0][0]();
		expect(mocks.save.mock.calls.at(-1)![0].messages.at(-1).content).toBe("Created proof.txt");
	});

	it("does not claim success or unattended execution while another request owns the lease", async () => {
		mocks.reconcile.mockResolvedValue(null);
		mocks.getOperation.mockResolvedValue({ id: "journal-run", status: "queued" });
		const response = await runPost(request({ machineId: "tenant-machine", prompt: "Create proof.txt" }));
		expect(response.status).toBe(202);
		expect(await response.json()).toMatchObject({ status: "queued", operation: { id: "journal-run" } });
		const stream = await (await POST(request({ machineId: "tenant-machine", messages: [{ role: "user", content: "Create proof.txt" }] }))).text();
		expect(stream).toContain("not completed");
		expect(stream).toContain("not guaranteed to execute unattended");
		expect(stream).not.toContain("Worker run completed");
	});

	it("never starts another reconciliation after its execution budget expires", async () => {
		const now = vi.spyOn(Date, "now");
		now.mockReturnValueOnce(1_000).mockReturnValue(300_000);
		try {
			const response = await runPost(request({ machineId: "tenant-machine", prompt: "Create proof.txt" }));
			expect(response.status).toBe(202);
			expect(mocks.reconcile).not.toHaveBeenCalled();
		} finally { now.mockRestore(); }
	});

	it.each([{ exitCode: 7, events: [] }, { exitCode: 0, events: [{ type: "result", text: "API authorization failed", isError: true }] }])("does not treat a nonzero or runtime-reported failure as success", async (result) => {
		mocks.reconcile.mockResolvedValue({ operation: { id: "journal-run", status: "succeeded", result: { text: "Failed", ...result } } });
		const response = await POST(request({ machineId: "tenant-machine", conversationId: "failure-chat", messages: [{ role: "user", content: "run" }] }));
		let accumulator = createStreamAccumulator();
		for await (const event of readSseStream(response.body!)) accumulator = processAgentEvent(event, accumulator);
		expect(accumulator.events).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "error" })]));
		expect(accumulator.events).not.toEqual(expect.arrayContaining([expect.objectContaining({ kind: "status", label: "Worker run completed" })]));
		expect(mocks.save.mock.calls.at(-1)![0].messages.at(-1).agentEvents).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "error" })]));
	});

	it("retains partial tool evidence when an operation returns a failed result", async () => {
		mocks.reconcile.mockResolvedValue({ operation: { id: "journal-run", status: "failed", error: "Run failed", result: { text: "Partial answer", exitCode: 1, events: [{ type: "tool_call", id: "partial", name: "Bash", input: '{"command":"false"}' }, { type: "tool_result", id: "partial", output: "failed", isError: true }] } } });
		const stream = await (await POST(request({ machineId: "tenant-machine", conversationId: "partial-chat", messages: [{ role: "user", content: "run" }] }))).text();
		expect(stream).toContain("tool.start");
		expect(stream).toContain("Run failed");
		expect(mocks.save.mock.calls.at(-1)![0].messages.at(-1).agentEvents).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "shell_exec", status: "error" })]));
	});

	it("fails closed before probing runtimes for an unauthenticated request", async () => {
		mocks.user.mockResolvedValue(null);
		expect((await GET(new Request("https://agent-machines.test/api/agents/run?machineId=tenant-machine"))).status).toBe(401);
		expect((await POST(request({ machineId: "tenant-machine", messages: [{ role: "user", content: "run" }] }))).status).toBe(401);
		expect(mocks.state).not.toHaveBeenCalled();
		expect(mocks.submit).not.toHaveBeenCalled();
	});

	it.each(["sleeping", "starting", "destroyed"])("does not launch a lifecycle install from Console when compute is %s", async (state) => {
		mocks.state.mockResolvedValue({ state });
		const response = await POST(request({ machineId: "tenant-machine", messages: [{ role: "user", content: "run" }] }));
		expect(response.status).toBe(409);
		expect(mocks.submit).not.toHaveBeenCalled();
	});

	it("checks runtime installation again at POST, not just in the UI", async () => {
		mocks.artifacts.mockResolvedValue(false);
		const response = await POST(request({ machineId: "tenant-machine", messages: [{ role: "user", content: "run" }] }));
		expect(response.status).toBe(409);
		expect(mocks.submit).not.toHaveBeenCalled();
	});

	it("reports insufficient observed OpenClaw memory without confusing it with a missing install", async () => {
		setup("openclaw");
		mocks.state.mockResolvedValue({ state: "ready", spec: { memoryMib: 512 } });
		const response = await GET(new Request("https://agent-machines.test/api/agents/run?machineId=tenant-machine"));
		expect(await response.json()).toMatchObject({ ok: false, error: "insufficient_runtime_memory", capacity: { status: "blocked", memoryMib: 512 } });
		expect(mocks.artifacts).not.toHaveBeenCalled();
	});
	it.each(["api", "console"])("rejects a %s OpenClaw run before journal or model work on a known-small allocation", async (surface) => {
		setup("openclaw");
		mocks.state.mockResolvedValue({ state: "ready", spec: { memoryMib: 512 } });
		const response = await (surface === "api" ? runPost : POST)(request({ machineId: "tenant-machine", prompt: "Read a file" }));
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ ok: false, error: "insufficient_runtime_memory" });
		expect(mocks.submit).not.toHaveBeenCalled();
		expect(mocks.run).not.toHaveBeenCalled();
		expect(mocks.artifacts).not.toHaveBeenCalled();
	});
	it("does not infer observed OpenClaw RAM from the requested machine specification", async () => {
		setup("openclaw");
		const config = await mocks.config(); config.machines[0].spec = { vcpu: 8, memoryMib: 8192, storageGib: 10 };
		mocks.state.mockResolvedValue({ state: "ready", spec: {} });
		const response = await GET(new Request("https://agent-machines.test/api/agents/run?machineId=tenant-machine"));
		expect(await response.json()).toMatchObject({ ok: true, capacity: { status: "unverified", memoryMib: null } });
	});
	it("keeps the explicit Wake path when a small OpenClaw allocation is paused", async () => {
		setup("openclaw");
		mocks.state.mockResolvedValue({ state: "sleeping", spec: { memoryMib: 512 } });
		const response = await GET(new Request("https://agent-machines.test/api/agents/run?machineId=tenant-machine"));
		expect(await response.json()).toMatchObject({ ok: false, state: "sleeping" });
		expect(mocks.artifacts).not.toHaveBeenCalled();
	});
});
