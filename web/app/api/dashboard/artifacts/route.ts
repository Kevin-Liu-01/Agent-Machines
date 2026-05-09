/**
 * GET / POST /api/dashboard/artifacts
 *
 * Lists + uploads artifacts onto the user's active Dedalus machine.
 * Each artifact lives under `~/.agent-machines/artifacts/<id>/<name>`
 * with a sibling `_meta.json` describing it. The agent on the same
 * machine can read these files directly as context.
 */

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import { getEffectiveUserId } from "@/lib/user-config/identity";

import {
	listArtifacts,
	saveArtifact,
} from "@/lib/storage/machine-artifacts";
import { withActiveMachine } from "@/lib/storage/machine-fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

export async function GET(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const handle = await withActiveMachine();
	if ("ok" in handle) {
		return Response.json({ ...handle, artifacts: [] });
	}
	try {
		const artifacts = await listArtifacts();
		return Response.json({
			ok: true,
			artifacts,
			machineId: handle.machine.id,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "list_failed";
		return Response.json(
			{ ok: false, reason: "exec_failed", message, artifacts: [] },
			{ status: 502 },
		);
	}
}

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	const handle = await withActiveMachine();
	if ("ok" in handle) {
		return Response.json(handle, { status: 503 });
	}

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return Response.json({ error: "invalid_form" }, { status: 400 });
	}
	const file = form.get("file");
	const chatId = form.get("chatId");
	if (!(file instanceof File)) {
		return Response.json({ error: "file_required" }, { status: 422 });
	}
	if (file.size > MAX_BYTES) {
		return Response.json(
			{
				error: "too_large",
				message: `Artifact exceeds ${MAX_BYTES} byte cap (got ${file.size}). The execution-API write surface caps at 8 MiB per call; chunked upload lands in a follow-up.`,
			},
			{ status: 413 },
		);
	}
	try {
		const ref = await saveArtifact({
			id: randomUUID(),
			name: file.name,
			mime: file.type || "application/octet-stream",
			body: Buffer.from(await file.arrayBuffer()),
			chatId: typeof chatId === "string" && chatId ? chatId : undefined,
		});
		return Response.json({ ok: true, artifact: ref });
	} catch (err) {
		const message = err instanceof Error ? err.message : "save_failed";
		return Response.json(
			{ error: "save_failed", message },
			{ status: 502 },
		);
	}
}
