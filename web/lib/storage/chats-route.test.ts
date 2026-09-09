import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	user: vi.fn(), machine: vi.fn(), list: vi.fn(), save: vi.fn(), remove: vi.fn(),
}));
vi.mock("@/lib/user-config/identity", () => ({ getEffectiveUserId: mocks.user }));
vi.mock("@/lib/storage/machine-fs", () => ({ withActiveMachine: mocks.machine }));
vi.mock("@/lib/storage/machine-chats", () => ({
	listChats: mocks.list, saveChat: mocks.save, deleteChat: mocks.remove, loadChat: vi.fn(),
}));

import { GET, POST } from "@/app/api/dashboard/chats/route";

const storage = { machineId: "owned-machine", appDataRoot: "/home/daytona/.agent-machines" };
const message = { id: "user-turn", role: "user", content: "  Check\n my project  ", createdAt: 1788991990181 };
const valid = { id: "chat-valid", messages: [message] };
const post = (body: unknown) => POST(new Request("https://example.test/api/dashboard/chats", {
	method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}));

beforeEach(() => {
	vi.resetAllMocks();
	mocks.user.mockResolvedValue("current-user");
	mocks.machine.mockResolvedValue({ machine: { id: "owned-machine" }, storage });
	mocks.list.mockResolvedValue([]);
});

describe("chat persistence request boundary", () => {
	it("invariant_unauthenticated_requests_never_reach_machine_storage", async () => {
		mocks.user.mockResolvedValue(null);
		expect((await post(null)).status).toBe(401);
		expect(mocks.machine).not.toHaveBeenCalled();
		expect(mocks.save).not.toHaveBeenCalled();
	});

	it("invariant_malformed_json_is_rejected_before_machine_access", async () => {
		const response = await POST(new Request("https://example.test/api/dashboard/chats", { method: "POST", body: "{" }));
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "invalid_json" });
		expect(mocks.machine).not.toHaveBeenCalled();
	});

	it.each([
		["null body", null],
		["array body", []],
		["scalar body", 42],
		["object title", { ...valid, title: {} }],
		["null message", { ...valid, messages: [null] }],
		["array message", { ...valid, messages: [[]] }],
		["unknown role", { ...valid, messages: [{ ...message, role: "other" }] }],
		["non-text content", { ...valid, messages: [{ ...message, content: 42 }] }],
		["invalid message id", { ...valid, messages: [{ ...message, id: {} }] }],
		["invalid message timestamp", { ...valid, messages: [{ ...message, createdAt: {} }] }],
		["object target", { ...valid, machineId: {} }],
		["object model", { ...valid, model: {} }],
		["object creation time", { ...valid, createdAt: {} }],
		["invalid packages", { ...valid, sessionPackageIds: [null] }],
	])("invariant_invalid_payload_never_reaches_machine_storage: %s", async (_label, body) => {
		const response = await post(body);
		expect(response.status).toBe(400);
		expect(mocks.machine).not.toHaveBeenCalled();
		expect(mocks.save).not.toHaveBeenCalled();
	});

	it.each([
		[{ messages: [] }, "id_required"],
		[{ id: "chat-valid" }, "messages_required"],
	])("invariant_missing_required_fields_are_checked_before_machine_access", async (body, error) => {
		const response = await post(body);
		expect(response.status).toBe(422);
		expect(await response.json()).toEqual({ error });
		expect(mocks.machine).not.toHaveBeenCalled();
		expect(mocks.save).not.toHaveBeenCalled();
	});

	it("invariant_valid_history_retains_runtime_evidence_and_is_pinned_to_owned_storage", async () => {
		const assistant = {
			id: "assistant-turn", role: "assistant", content: "Done", createdAt: 1788991991000,
			events: [{ type: "status", label: "Saved", timestamp: 1788991991000 }],
			agentEvents: [{ type: "text", text: "Done" }], operationId: "operation-1", model: "custom/text-model", durationMs: 100,
		};
		const body = { ...valid, messages: [message, assistant], machineId: "requested-machine", model: "custom/text-model",
			createdAt: "2026-09-09T22:00:00.000Z", updatedAt: "old-client-time", messageCount: 999, sessionPackageIds: ["package-1"] };
		const response = await post(body);
		expect(response.status).toBe(200);
		const result = await response.json();
		expect(result).toMatchObject({ ok: true, chat: { ...body, title: "Check my project", machineId: "owned-machine", messageCount: 2, updatedAt: expect.any(String) } });
		expect(result.chat.updatedAt).not.toBe(body.updatedAt);
		expect(Number.isFinite(Date.parse(result.chat.updatedAt))).toBe(true);
		expect(mocks.machine).toHaveBeenCalledExactlyOnceWith("requested-machine");
		expect(mocks.save).toHaveBeenCalledExactlyOnceWith(result.chat, storage);
	});

	it("design_empty_history_gets_safe_defaults_and_titles_are_bounded", async () => {
		const empty = await (await post({ id: "empty-chat", messages: [] })).json();
		expect(empty.chat).toMatchObject({ title: "untitled chat", messageCount: 0 });
		expect(Number.isFinite(Date.parse(empty.chat.createdAt))).toBe(true);
		const titled = await (await post({ ...valid, title: "x".repeat(150) })).json();
		expect(titled.chat.title).toHaveLength(120);
	});

	it("invariant_unavailable_owned_machine_does_not_fall_back_or_save", async () => {
		mocks.machine.mockResolvedValue({ ok: false, reason: "machine_asleep" });
		expect((await post({ ...valid, machineId: "sleeping-machine" })).status).toBe(503);
		expect(mocks.machine).toHaveBeenCalledExactlyOnceWith("sleeping-machine");
		expect(mocks.save).not.toHaveBeenCalled();
	});

	it("invariant_failed_persistence_is_never_reported_as_saved", async () => {
		mocks.save.mockRejectedValue(new Error("storage unavailable"));
		const response = await post(valid);
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({ error: "save_failed", message: "storage unavailable" });
	});

	it("invariant_failed_read_remains_visible_and_a_later_request_can_recover", async () => {
		mocks.list.mockRejectedValueOnce(new Error("read unavailable")).mockResolvedValueOnce([]);
		const request = () => new Request("https://example.test/api/dashboard/chats?machineId=owned-machine");
		const failed = await GET(request());
		expect(failed.status).toBe(502);
		expect(await failed.json()).toEqual({ ok: false, reason: "exec_failed", message: "read unavailable", chats: [] });
		expect(await (await GET(request())).json()).toEqual({ ok: true, chats: [], machineId: "owned-machine" });
	});
});
