export type ControlPlaneOperationView = {
	operation: { id: string; status: string; error?: string | null };
	worker?: { status?: { phase?: string; lastError?: string | null } } | null;
	machineId?: string | null;
};

/** Poll the cheap journal read, never the provider, until an action settles. */
export async function waitForControlPlaneOperation(
	operationId: string,
	options: {
		timeoutMs?: number;
		intervalMs?: number;
		onUpdate?: (view: ControlPlaneOperationView) => void;
	} = {},
): Promise<ControlPlaneOperationView> {
	const deadline = Date.now() + (options.timeoutMs ?? 300_000);
	const intervalMs = options.intervalMs ?? 500;
	while (Date.now() < deadline) {
		const response = await fetch(
			`/api/dashboard/control-plane/operations/${encodeURIComponent(operationId)}`,
			{ cache: "no-store" },
		);
		const body = (await response.json().catch(() => ({}))) as Partial<ControlPlaneOperationView> & {
			message?: string;
		};
		if (!response.ok || !body.operation) {
			throw new Error(body.message ?? "Could not read lifecycle operation.");
		}
		options.onUpdate?.(body as ControlPlaneOperationView);
		if (body.operation.status === "succeeded") return body as ControlPlaneOperationView;
		if (body.operation.status === "failed") {
			throw new Error(
				body.operation.error ??
					body.worker?.status?.lastError ??
					"Lifecycle operation failed.",
			);
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	throw new Error("Lifecycle operation timed out while continuing in the background.");
}
