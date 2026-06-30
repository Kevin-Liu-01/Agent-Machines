/**
 * Shared machine-provisioning core: provision via the provider, build the
 * MachineRef, persist it, and make it active. Used by both the admin
 * provision route and deploy-from-worker so the two never drift.
 */

import { getProvider } from "@/lib/providers";
import { DEFAULT_ROUTER_ID, ROUTER_PRESETS } from "@/lib/agents/upstreams";
import { setUserConfig } from "@/lib/user-config/clerk";
import {
	INITIAL_BOOTSTRAP_STATE,
	type AgentKind,
	type MachineRef,
	type MachineSpec,
	type ProviderKind,
	type UserConfig,
} from "@/lib/user-config/schema";

export type CreateMachineOpts = {
	providerKind: ProviderKind;
	agentKind: AgentKind;
	spec: MachineSpec;
	model: string;
	name: string;
	/** Router preset id or saved gateway-profile id (hermes/openclaw). */
	gatewayProfileId?: string | null;
	/** Optional saved environment profile whose vars are installed on the VM. */
	environmentProfileId?: string | null;
};

export type CreatedMachine = { machineId: string; phase: string; state: string };

export async function createMachineForConfig(
	config: UserConfig,
	opts: CreateMachineOpts,
): Promise<CreatedMachine> {
	const provider = getProvider(opts.providerKind, config.providers);
	const environmentProfileId =
		typeof opts.environmentProfileId === "string" &&
		config.environmentProfiles.some((p) => p.id === opts.environmentProfileId)
			? opts.environmentProfileId
			: (config.environmentProfiles[0]?.id ?? null);
	const environmentVars = environmentProfileId
		? config.environmentProfiles.find((p) => p.id === environmentProfileId)?.vars
		: undefined;
	const result = await provider.provision({
		spec: opts.spec,
		name: opts.name,
		agentKind: opts.agentKind,
		model: opts.model,
		env: environmentVars,
	});

	// Accept a saved gateway profile id or a built-in router preset id (presets
	// resolve by id at bootstrap, not persisted as profiles).
	const isKnownRouter =
		typeof opts.gatewayProfileId === "string" &&
		(config.gatewayProfiles.some((p) => p.id === opts.gatewayProfileId) ||
			ROUTER_PRESETS.some((p) => p.id === opts.gatewayProfileId));
	const gatewayProfileId =
		(isKnownRouter ? opts.gatewayProfileId ?? null : null) ??
		config.gatewayProfiles.find((profile) => profile.id === DEFAULT_ROUTER_ID)?.id ??
		DEFAULT_ROUTER_ID;

	const ref: MachineRef = {
		id: result.id,
		providerKind: opts.providerKind,
		agentKind: opts.agentKind,
		name: opts.name,
		spec: opts.spec,
		model: opts.model,
		// agentProfileId is retired (Memory now carries abilities); kept on the
		// row as a vestigial nullable column.
		agentProfileId: null,
		gatewayProfileId,
		environmentProfileId,
		bootstrapPresetId: null,
		createdAt: new Date().toISOString(),
		apiUrl: null,
		apiKey: null,
		bootstrapState: { ...INITIAL_BOOTSTRAP_STATE },
	};
	await setUserConfig({
		upsertMachine: ref,
		activeMachineId: ref.id,
		setupStep: "provisioned",
	});
	return { machineId: ref.id, phase: result.rawPhase, state: result.state };
}
