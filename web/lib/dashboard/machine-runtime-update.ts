import { waitForControlPlaneOperation } from "@/lib/control-plane/client";

/** Submit desired configuration, then report journal completion—not a label write. */
export async function requestMachineRuntimeUpdate(
	machineId: string,
	selection: { model?: string; gatewayProfileId?: string | null },
	onProgress?: (message: string) => void,
): Promise<string> {
	const response = await fetch(`/api/dashboard/machines/${encodeURIComponent(machineId)}`, {
		method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(selection),
	});
	const body = await response.json().catch(() => ({})) as {
		ok?: boolean; error?: string; message?: string; deferredUntilWake?: boolean; metadataWarning?: string;
		operation?: { id: string; status: string; error?: string | null };
	};
	if (!response.ok || !body.ok || body.operation?.status === "failed") {
		throw new Error(body.message ?? body.operation?.error ?? body.error ?? `Runtime update failed (HTTP ${response.status}).`);
	}
	if (!body.operation?.id) throw new Error("The server did not confirm a runtime operation. Refresh before retrying.");
	onProgress?.(body.deferredUntilWake ? "Saving configuration for the next wake…" : "Runtime update queued…");
	const completed = body.operation.status === "succeeded" ? null : await waitForControlPlaneOperation(body.operation.id, {
		onUpdate: (view) => onProgress?.(view.operation.status === "queued" ? "Runtime update queued…"
			: `Updating configuration · ${view.worker?.status?.phase ?? view.operation.status}…`),
	});
	const phase = completed?.worker?.status?.phase;
	const deferred = phase ? phase === "sleeping" : body.deferredUntilWake;
	const result = deferred
		? "Saved for next wake. The Worker remains paused."
		: "Configured for new runs. Relaunch an already-open CLI to use it there.";
	return body.metadataWarning ? `${result} ${body.metadataWarning}` : result;
}
