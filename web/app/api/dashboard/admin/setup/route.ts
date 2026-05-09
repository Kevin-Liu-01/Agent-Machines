/**
 * GET / POST /api/dashboard/admin/setup
 *
 * GET  -- returns the user's `PublicUserConfig` + the project owner's
 *         env-derived defaults. The wizard hydrates from this.
 * POST -- applies a partial wizard patch:
 *         { providerCredentials, cursorApiKey,
 *           draftAgentKind, draftProviderKind, draftSpec, draftModel,
 *           setupStep }
 *
 * Validation lives here so wire-shape errors land as 400s with a
 * useful message; storage is `setUserConfig` in clerk.ts.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import {
	getOwnerDefaults,
	getUserConfig,
	setUserConfig,
} from "@/lib/user-config/clerk";
import {
	AGENT_KINDS,
	PROVIDER_KINDS,
	SETUP_STEPS,
	toPublicConfig,
	type AgentKind,
	type MachineSpec,
	type ProviderCredentials,
	type ProviderKind,
	type SetupStep,
} from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAgent(value: unknown): value is AgentKind {
	return typeof value === "string" && (AGENT_KINDS as ReadonlyArray<string>).includes(value);
}

function isProvider(value: unknown): value is ProviderKind {
	return (
		typeof value === "string" &&
		(PROVIDER_KINDS as ReadonlyArray<string>).includes(value)
	);
}

function isStep(value: unknown): value is SetupStep {
	return typeof value === "string" && (SETUP_STEPS as ReadonlyArray<string>).includes(value);
}

function asSpec(value: unknown): MachineSpec | null {
	if (!value || typeof value !== "object") return null;
	const v = value as Record<string, unknown>;
	const vcpu = Number(v.vcpu);
	const mem = Number(v.memoryMib);
	const stor = Number(v.storageGib);
	if (!Number.isFinite(vcpu) || vcpu < 1 || vcpu > 16) return null;
	if (!Number.isFinite(mem) || mem < 512 || mem > 65_536) return null;
	if (!Number.isFinite(stor) || stor < 5 || stor > 200) return null;
	return { vcpu, memoryMib: mem, storageGib: stor };
}

type CredsBody = {
	dedalus?: { apiKey?: string };
	"vercel-sandbox"?: { apiKey?: string; teamId?: string };
	fly?: { apiKey?: string; orgSlug?: string };
};

type SetupBody = {
	providerCredentials?: CredsBody;
	cursorApiKey?: string;
	draftAgentKind?: AgentKind;
	draftProviderKind?: ProviderKind;
	draftSpec?: MachineSpec;
	draftModel?: string;
	setupStep?: SetupStep;
};

function validateCreds(input: CredsBody): {
	ok: true;
	value: ProviderCredentials;
} | { ok: false; error: string; message: string } {
	const out: ProviderCredentials = {};
	if (input.dedalus) {
		const k = (input.dedalus.apiKey ?? "").trim();
		if (k && !k.startsWith("dsk-")) {
			return {
				ok: false,
				error: "invalid_dedalus_key",
				message: "Dedalus keys start with 'dsk-'.",
			};
		}
		if (k) out.dedalus = { apiKey: k };
	}
	if (input["vercel-sandbox"]) {
		const k = (input["vercel-sandbox"].apiKey ?? "").trim();
		const team = (input["vercel-sandbox"].teamId ?? "").trim() || undefined;
		if (k) out["vercel-sandbox"] = { apiKey: k, teamId: team };
	}
	if (input.fly) {
		const k = (input.fly.apiKey ?? "").trim();
		const org = (input.fly.orgSlug ?? "").trim() || undefined;
		if (k) out.fly = { apiKey: k, orgSlug: org };
	}
	return { ok: true, value: out };
}

export async function GET(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	const config = await getUserConfig();
	const defaults = getOwnerDefaults();
	return Response.json({
		config: toPublicConfig(config),
		defaults: {
			machineSpec: defaults.draftSpec,
			model: defaults.draftModel,
			hasOwnerDedalusKey: Boolean(defaults.providers.dedalus?.apiKey),
			hasOwnerCursorKey: Boolean(defaults.cursorApiKey),
			hasOwnerMachine: defaults.machines.length > 0,
		},
	});
}

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	let body: SetupBody;
	try {
		body = (await request.json()) as SetupBody;
	} catch {
		return Response.json({ error: "invalid_json" }, { status: 400 });
	}

	const patch: Parameters<typeof setUserConfig>[0] = {};

	if (body.providerCredentials) {
		const validated = validateCreds(body.providerCredentials);
		if (!validated.ok) {
			return Response.json(
				{ error: validated.error, message: validated.message },
				{ status: 400 },
			);
		}
		patch.providers = validated.value;
	}
	if (body.cursorApiKey !== undefined) {
		const v = String(body.cursorApiKey).trim();
		patch.cursorApiKey = v.length > 0 ? v : null;
	}
	if (body.draftAgentKind !== undefined) {
		if (!isAgent(body.draftAgentKind)) {
			return Response.json({ error: "invalid_agent_kind" }, { status: 400 });
		}
		patch.draftAgentKind = body.draftAgentKind;
	}
	if (body.draftProviderKind !== undefined) {
		if (!isProvider(body.draftProviderKind)) {
			return Response.json({ error: "invalid_provider_kind" }, { status: 400 });
		}
		patch.draftProviderKind = body.draftProviderKind;
	}
	if (body.draftSpec !== undefined) {
		const spec = asSpec(body.draftSpec);
		if (!spec) {
			return Response.json(
				{
					error: "invalid_machine_spec",
					message:
						"Spec must be { vcpu: 1-16, memoryMib: 512-65536, storageGib: 5-200 }",
				},
				{ status: 400 },
			);
		}
		patch.draftSpec = spec;
	}
	if (body.draftModel !== undefined) {
		const m = String(body.draftModel).trim();
		if (m.length > 0) patch.draftModel = m;
	}
	if (body.setupStep !== undefined) {
		if (!isStep(body.setupStep)) {
			return Response.json({ error: "invalid_setup_step" }, { status: 400 });
		}
		patch.setupStep = body.setupStep;
	}

	const next = await setUserConfig(patch);
	return Response.json({ config: toPublicConfig(next) });
}
