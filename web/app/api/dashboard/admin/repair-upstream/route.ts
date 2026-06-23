/**
 * POST /api/dashboard/admin/repair-upstream
 *
 * Fix Hermes model.base_url when it was written with the DCS control-plane
 * URL instead of the Dedalus LLM router (api.dedaluslabs.ai/v1).
 */

import { finalizeGatewayBootstrap, normalizeDedalusLlmBaseUrl } from "@/lib/bootstrap/runner";
import { getProvider } from "@/lib/providers";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import type { MachineRef } from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = { machineId?: string };

function homeFor(providerKind: MachineRef["providerKind"]): string {
	if (providerKind === "e2b") return "/home/user";
	if (providerKind === "sprites") return "/home/sprite";
	return "/home/machine";
}

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	const body = (await request.json().catch(() => ({}))) as Body;
	const config = await getUserConfig();
	const machineId = body.machineId ?? config.activeMachineId;
	const machine = machineId
		? config.machines.find((m) => m.id === machineId) ?? null
		: null;
	if (!machine) {
		return Response.json({ error: "not_found" }, { status: 404 });
	}
	if (machine.agentKind !== "hermes" && machine.agentKind !== "openclaw") {
		return Response.json({ error: "unsupported_agent" }, { status: 422 });
	}

	const dedalusKey = config.providers.dedalus?.apiKey ?? "";
	const ai = config.aiProviderKeys ?? {};
	const anthropicKey = ai.anthropic ?? dedalusKey;
	const openaiKey = ai.openai ?? dedalusKey;
	const baseUrl = normalizeDedalusLlmBaseUrl(config.providers.dedalus?.baseUrl);

	const provider = getProvider(machine.providerKind, config.providers);
	const home = homeFor(machine.providerKind);
	const pathExports = `export PATH=${home}/.npm-global/bin:${home}/.local/bin:${home}/.agent-machines/venv/bin:$PATH`;

	let command: string;
	if (machine.agentKind === "openclaw") {
		const openclawHome = `${home}/.openclaw`;
		if (!anthropicKey && !openaiKey && !dedalusKey) {
			return Response.json({ error: "missing_upstream_key" }, { status: 400 });
		}
		command = [
			`export HOME=${home}`,
			pathExports,
			`export OPENCLAW_STATE_DIR=${openclawHome}`,
			`openclaw config set env.vars.ANTHROPIC_BASE_URL ${baseUrl}`,
			anthropicKey ? `openclaw config set env.vars.ANTHROPIC_API_KEY ${anthropicKey}` : "true",
			openaiKey ? `openclaw config set env.vars.OPENAI_API_KEY ${openaiKey}` : "true",
			`grep -q ANTHROPIC ${openclawHome}/openclaw.json 2>/dev/null || test -d ${openclawHome}`,
		].join("\n");
	} else {
		const hermesHome = `${home}/.agent-machines`;
		const upstreamKey = dedalusKey || anthropicKey || openaiKey;
		if (!upstreamKey) {
			return Response.json({ error: "missing_dedalus_key" }, { status: 400 });
		}
		command = [
			`export HOME=${home}`,
			pathExports,
			`export HERMES_HOME=${hermesHome}`,
			`hermes config set model.provider custom`,
			`hermes config set model.base_url ${baseUrl}`,
			`hermes config set model.api_key ${upstreamKey}`,
			`hermes config set display.streaming true`,
			`hermes config set display.tool_progress all`,
			`grep -q 'base_url' ${hermesHome}/config.yaml`,
		].join("\n");
	}

	const result = await provider.exec(machine.id, command, { timeoutMs: 60_000 });
	const combined = `${result.stdout}\n${result.stderr}`.trim();
	const configApplied =
		result.exitCode === 0 ||
		(combined.includes("model.base_url") && combined.includes(baseUrl));
	if (!configApplied) {
		return Response.json(
			{
				ok: false,
				error: "repair_failed",
				message: result.stderr || result.stdout || `exit ${result.exitCode}`,
			},
			{ status: 502 },
		);
	}

	// Bounce gateway so Hermes picks up the new upstream URL.
	await finalizeGatewayBootstrap({
		machine,
		provider,
		config,
		onState: async (bootstrapState) => {
			await setUserConfig({
				patchMachine: { id: machine.id, patch: { bootstrapState } },
			}).catch(() => {});
		},
	}).catch(() => {});

	return Response.json({ ok: true, machineId: machine.id, baseUrl });
}
