import { prepareManagedRun, runErrorResponse } from "@/lib/agents/managed-run";
import { runtimeCapacity } from "@/lib/agents/runtime-capacity";
import { agentArtifactsPresent } from "@/lib/bootstrap/bootstrap-repair";
import { resolveMachine } from "@/lib/dashboard/exec";
import { getProvider } from "@/lib/providers";
import { getUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Reachable compute and on-disk runtime artifacts, not model-request success. */
export async function GET(request: Request): Promise<Response> {
	if (!(await getEffectiveUserId())) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
	try {
		const config = await getUserConfig();
		const machine = resolveMachine(config, new URL(request.url).searchParams.get("machineId"));
		if (!machine || machine.archived) return Response.json({ ok: false, error: "machine_not_found", message: "Select a machine in your account." }, { status: 404 });
		const provider = getProvider(machine.providerKind, config.providers);
		const state = await provider.state(machine.id);
		if (state.state !== "ready") return Response.json({ ok: false, state: state.state, message: `Worker is ${state.state}. Wake it from the machine overview.` });
		const capacity = runtimeCapacity(machine.agentKind, state.spec?.memoryMib);
		if (capacity.status === "blocked") return Response.json({ ok: false, machineId: machine.id, agent: machine.agentKind, error: "insufficient_runtime_memory", capacity, message: capacity.message });
		const ready = await agentArtifactsPresent(machine, provider);
		return Response.json({ ok: ready, machineId: machine.id, agent: machine.agentKind, model: machine.model, mode: "managed-runtime", capacity, message: ready ? `Runtime installed and machine reachable. Model credentials are checked when a run starts.${capacity.message ? ` ${capacity.message}` : ""}` : "The selected runtime is not installed or configured. Bootstrap the Worker first." });
	} catch (error) {
		return Response.json({ ok: false, error: "runtime_unreachable", message: error instanceof Error ? error.message : "Runtime probe failed." }, { status: 502 });
	}
}

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	try {
		const run = await prepareManagedRun(request, userId);
		const { result, ...outcome } = await run.execute();
		return Response.json({ ok: true, mode: "control-plane", ...outcome, ...result, status: outcome.operation.status, statusUrl: `/api/dashboard/control-plane/operations/${outcome.operation.id}` }, { status: result ? 200 : 202 });
	} catch (error) { return runErrorResponse(error); }
}
