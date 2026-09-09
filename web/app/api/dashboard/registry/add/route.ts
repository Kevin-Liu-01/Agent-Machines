/** Save a library entry; run its reviewed command only with an explicit target. */
import { execOnMachine, isMachineRunning, resolveMachine } from "@/lib/dashboard/exec";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import { toPublicConfig, type CustomLoadoutEntry } from "@/lib/user-config/schema";
import type { RegistryItem, RegistryInstallOutcome } from "@/lib/dashboard/registry/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const KINDS = new Set(["skill", "mcp", "cli", "tool", "plugin", "provider", "source"]);
function validItem(value: unknown): value is RegistryItem {
	if (!value || typeof value !== "object") return false;
	const item = value as Record<string, unknown>;
	return typeof item.id === "string" && item.id.length > 0 && item.id.length <= 512
		&& typeof item.name === "string" && item.name.trim().length > 0 && item.name.length <= 256
		&& typeof item.kind === "string" && KINDS.has(item.kind)
		&& typeof item.description === "string" && item.description.length <= 8_000
		&& (item.installCommand === null || (typeof item.installCommand === "string" && item.installCommand.length <= 16_000 && !item.installCommand.includes("\0")));
}

export async function POST(request: Request): Promise<Response> {
	if (!(await getEffectiveUserId())) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
	let body: { item?: unknown; install?: unknown; machineId?: unknown };
	try {
		const raw = await request.text();
		if (Buffer.byteLength(raw) > 64 * 1024) return Response.json({ ok: false, error: "Registry request is too large." }, { status: 413 });
		body = JSON.parse(raw);
	} catch { return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 }); }
	if (!body || !validItem(body.item) || (body.install !== undefined && typeof body.install !== "boolean")
		|| (body.machineId !== undefined && body.machineId !== null && typeof body.machineId !== "string")) {
		return Response.json({ ok: false, error: "Invalid registry item or installation target." }, { status: 400 });
	}
	const item = body.item;
	const config = await getUserConfig();
	const machineId = typeof body.machineId === "string" ? body.machineId : null;
	const machine = machineId ? resolveMachine(config, machineId) : null;
	if (body.install && (!machine || machine.archived)) {
		return Response.json({ ok: false, error: "Choose a Worker in your account before running an install command." }, { status: 400 });
	}
	const prior = config.customLoadout.find((entry) => entry.id === item.id);
	const now = new Date().toISOString();
	const entry: CustomLoadoutEntry = {
		id: item.id, name: item.name, description: item.description,
		kind: item.kind === "source" || item.kind === "provider" ? "tool" : item.kind,
		command: item.installCommand, enabled: true, createdAt: prior?.createdAt ?? now, updatedAt: now,
	};
	let next;
	try {
		next = await setUserConfig({ customLoadout: [...config.customLoadout.filter((candidate) => candidate.id !== item.id), entry] });
	} catch {
		return Response.json({ ok: false, error: "Could not save the library entry. No install was run." }, { status: 500 });
	}
	const reply = (outcome: RegistryInstallOutcome) => Response.json({ ok: true, config: toPublicConfig(next), ...outcome });
	if (!body.install) return reply({ status: "saved", installOk: false, machineId: null, installLog: "Saved to your library. No command was run and no runtime connection was configured." });
	// A server launch command is not an installer. MCP credentials, permissions,
	// transports and runtime wiring need explicit configuration, not a hung npx.
	if (!item.installCommand?.trim() || item.kind === "mcp" || item.kind === "plugin" || item.kind === "provider" || item.kind === "source") {
		return reply({ status: "manual_setup", installOk: false, machineId, installLog: "Saved to your library. This item requires manual setup; follow its source documentation and configure the selected runtime. It is not installed or verified." });
	}
	if (!(await isMachineRunning(machineId))) {
		return reply({ status: "machine_offline", installOk: false, machineId, installLog: "Saved, but this Worker is offline. Wake it, then retry installation here. Nothing is queued to run automatically." });
	}
	try {
		const result = await execOnMachine(item.installCommand, { machineId, timeoutMs: 120_000 });
		const succeeded = result.exitCode === 0;
		const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
		const limit = 32_000;
		return reply({ status: succeeded ? "command_succeeded" : "failed", installOk: succeeded, machineId,
			installLog: `${succeeded ? "Install command completed. Runtime availability and permissions have not been verified." : `Install command failed (exit ${result.exitCode}). You can retry.`}\n${output.slice(0, limit)}${output.length > limit ? "\n[Log truncated.]" : ""}` });
	} catch (error) {
		return reply({ status: "failed", installOk: false, machineId, installLog: `Install did not complete: ${error instanceof Error ? error.message.slice(0, 2_000) : "execution failed"}. The library entry is saved; retry when the Worker is ready.` });
	}
}
