import type { AgentKind, ProviderKind } from "@/lib/user-config/schema";

export type OnboardingLaunch = {
	workerId: string;
	operationId: string | null;
};

/** A token replacement is usable only when the full Vercel scope is supplied. */
export function onboardingProviderReady(
	provider: ProviderKind,
	configured: boolean,
	key: string,
	secondary: Record<string, string>,
): boolean {
	if (!key.trim()) return configured;
	return provider !== "vercel" || Boolean(secondary.teamId?.trim() && secondary.projectId?.trim());
}

async function post(url: string, payload?: unknown, idempotencyKey?: string) {
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
		},
		...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
	});
	const body = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(body.message ?? body.error ?? `Launch request failed (HTTP ${response.status}).`);
	}
	return body as { workerId?: string; operation?: { id?: string; status?: string } };
}

/**
 * Keep one Worker identity across retries, including responses lost after a
 * server write. Only a confirmed failed operation starts a new reconciliation;
 * a pending operation keeps its existing journal entry and sandbox.
 */
export async function submitOnboardingLaunch(
	launch: OnboardingLaunch,
	input: {
		setup: Record<string, unknown>;
		presetId: string | null;
		agentKind: AgentKind;
		providerKind: ProviderKind;
		gatewayProfileId: string;
	},
): Promise<string> {
	let retryFailed = Boolean(launch.operationId);
	await post("/api/dashboard/admin/setup", input.setup);
	if (!launch.operationId) {
		const preset = await post("/api/dashboard/admin/apply-preset", {
			workerId: launch.workerId,
			presetId: input.presetId,
			agentKind: input.agentKind,
			gatewayProfileId: input.gatewayProfileId,
			machineId: null,
		});
		if (preset.workerId !== launch.workerId) throw new Error("Could not save the Worker recipe.");
		const accepted = await post("/api/dashboard/admin/provision-machine", {
			providerKind: input.providerKind,
			workerId: launch.workerId,
			gatewayProfileId: input.gatewayProfileId,
		}, `onboarding:${launch.workerId}`);
		if (!accepted.operation?.id) throw new Error("Launch did not return a lifecycle operation.");
		launch.operationId = accepted.operation.id;
		retryFailed = accepted.operation.status === "failed";
	}

	const url = `/api/dashboard/control-plane/operations/${encodeURIComponent(launch.operationId)}`;
	const response = await fetch(url, { cache: "no-store" });
	const body = await response.json().catch(() => ({}));
	if (!response.ok || !body.operation) {
		throw new Error(body.message ?? `Could not read launch progress (HTTP ${response.status}). Retry to reconnect.`);
	}
	if (retryFailed && body.operation.status === "failed") {
		const retry = await post(url);
		if (!retry.operation?.id) throw new Error("Retry did not return a lifecycle operation.");
		launch.operationId = retry.operation.id;
	}
	return launch.operationId;
}
