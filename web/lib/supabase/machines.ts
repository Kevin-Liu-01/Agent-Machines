import type {
	MachineRef,
	MachineSpec,
	BootstrapState,
	MigrationState,
} from "@/lib/user-config/schema";

import { supabaseAdmin } from "./client";

type MachineRow = {
	id: string;
	user_id: string;
	provider_kind: string;
	agent_kind: string;
	name: string;
	model: string;
	spec: MachineSpec;
	api_url: string | null;
	api_key: string | null;
	agent_profile_id: string | null;
	gateway_profile_id: string | null;
	environment_profile_id: string | null;
	bootstrap_preset_id: string | null;
	bootstrap_state: BootstrapState;
	/** Added by 007_machine_migration_state.sql; absent rows read undefined. */
	migration_state?: MigrationState | null;
	archived: boolean;
	created_at: string;
	updated_at: string;
};

function rowToRef(row: MachineRow): MachineRef {
	return {
		id: row.id,
		providerKind: row.provider_kind as MachineRef["providerKind"],
		agentKind: row.agent_kind as MachineRef["agentKind"],
		name: row.name,
		model: row.model,
		spec: row.spec,
		apiUrl: row.api_url,
		apiKey: row.api_key,
		agentProfileId: row.agent_profile_id,
		gatewayProfileId: row.gateway_profile_id,
		environmentProfileId: row.environment_profile_id,
		bootstrapPresetId: row.bootstrap_preset_id,
		bootstrapState: row.bootstrap_state,
		// Supabase is the machines source of truth when rows exist
		// (clerk.ts getUserConfigById), so this MUST round-trip here or every
		// read drops the field and migration progress polling reads nothing.
		migrationState: row.migration_state ?? undefined,
		archived: row.archived,
		createdAt: row.created_at,
	};
}

function refToRow(userId: string, ref: MachineRef): Omit<MachineRow, "updated_at"> {
	return {
		id: ref.id,
		user_id: userId,
		provider_kind: ref.providerKind,
		agent_kind: ref.agentKind,
		name: ref.name,
		model: ref.model,
		spec: ref.spec,
		api_url: ref.apiUrl,
		api_key: ref.apiKey,
		agent_profile_id: ref.agentProfileId,
		gateway_profile_id: ref.gatewayProfileId,
		environment_profile_id: ref.environmentProfileId,
		bootstrap_preset_id: ref.bootstrapPresetId,
		bootstrap_state: ref.bootstrapState,
		archived: ref.archived ?? false,
		created_at: ref.createdAt,
	};
}

export async function listMachines(userId: string): Promise<MachineRef[]> {
	const sb = supabaseAdmin();
	const { data, error } = await sb
		.from("machines")
		.select("*")
		.eq("user_id", userId)
		.order("created_at", { ascending: true });

	if (error) throw new Error(`listMachines: ${error.message}`);
	return ((data ?? []) as MachineRow[]).map(rowToRef);
}

export async function getMachine(
	userId: string,
	machineId: string,
): Promise<MachineRef | null> {
	const sb = supabaseAdmin();
	const { data, error } = await sb
		.from("machines")
		.select("*")
		.eq("user_id", userId)
		.eq("id", machineId)
		.maybeSingle();

	if (error) throw new Error(`getMachine: ${error.message}`);
	if (!data) return null;
	return rowToRef(data as MachineRow);
}

export async function upsertMachine(
	userId: string,
	machine: MachineRef,
): Promise<void> {
	const sb = supabaseAdmin();
	const row = refToRow(userId, machine);
	const { error } = await sb
		.from("machines")
		.upsert(
			{ ...row, updated_at: new Date().toISOString() },
			{ onConflict: "id,user_id" },
		);

	if (error) throw new Error(`upsertMachine: ${error.message}`);

	// Same isolation rationale as patchMachine below: migration_state rides a
	// second statement so an unapplied 007 migration cannot fail the upsert of
	// the machine row itself.
	if (machine.migrationState !== undefined) {
		const { error: migrationError } = await sb
			.from("machines")
			.update({ migration_state: machine.migrationState })
			.eq("user_id", userId)
			.eq("id", machine.id);
		if (migrationError) {
			console.warn(
				`upsertMachine(${machine.id}): migration_state write failed (apply web/supabase/migrations/007_machine_migration_state.sql): ${migrationError.message}`,
			);
		}
	}
}

export async function patchMachine(
	userId: string,
	machineId: string,
	patch: Partial<MachineRef>,
): Promise<void> {
	const sb = supabaseAdmin();
	const updates: Record<string, unknown> = {
		updated_at: new Date().toISOString(),
	};

	if (patch.name !== undefined) updates.name = patch.name;
	if (patch.model !== undefined) updates.model = patch.model;
	if (patch.apiUrl !== undefined) updates.api_url = patch.apiUrl;
	if (patch.apiKey !== undefined) updates.api_key = patch.apiKey;
	if (patch.spec !== undefined) updates.spec = patch.spec;
	if (patch.agentKind !== undefined) updates.agent_kind = patch.agentKind;
	if (patch.providerKind !== undefined) updates.provider_kind = patch.providerKind;
	if (patch.agentProfileId !== undefined) updates.agent_profile_id = patch.agentProfileId;
	if (patch.gatewayProfileId !== undefined) updates.gateway_profile_id = patch.gatewayProfileId;
	if (patch.environmentProfileId !== undefined) updates.environment_profile_id = patch.environmentProfileId;
	if (patch.bootstrapPresetId !== undefined) updates.bootstrap_preset_id = patch.bootstrapPresetId;
	if (patch.bootstrapState !== undefined) updates.bootstrap_state = patch.bootstrapState;
	if (patch.archived !== undefined) updates.archived = patch.archived;

	const { error } = await sb
		.from("machines")
		.update(updates)
		.eq("user_id", userId)
		.eq("id", machineId);

	if (error) throw new Error(`patchMachine: ${error.message}`);

	// migration_state is written in a SEPARATE statement (the memory_bundles /
	// workers precedent in clerk.ts): the column lands with
	// 007_machine_migration_state.sql, and folding it into the main update
	// would make EVERY patch -- including plain bootstrapState progress -- fail
	// with "unknown column" on a deployment that has not applied the migration
	// yet. Isolated, only migration progress is lost pre-migration, never the
	// bootstrap state machine.
	if (patch.migrationState !== undefined) {
		const { error: migrationError } = await sb
			.from("machines")
			.update({
				migration_state: patch.migrationState,
				updated_at: new Date().toISOString(),
			})
			.eq("user_id", userId)
			.eq("id", machineId);
		if (migrationError) {
			console.warn(
				`patchMachine(${machineId}): migration_state write failed (apply web/supabase/migrations/007_machine_migration_state.sql): ${migrationError.message}`,
			);
		}
	}
}

export async function archiveMachine(
	userId: string,
	machineId: string,
): Promise<void> {
	await patchMachine(userId, machineId, { archived: true });
}

export async function deleteMachine(
	userId: string,
	machineId: string,
): Promise<void> {
	const sb = supabaseAdmin();
	const { error } = await sb
		.from("machines")
		.delete()
		.eq("user_id", userId)
		.eq("id", machineId);

	if (error) throw new Error(`deleteMachine: ${error.message}`);
}

/**
 * Seed machines from Clerk metadata into Supabase (one-time migration).
 * Skips machines that already exist in Supabase.
 */
export async function seedMachinesFromClerk(
	userId: string,
	machines: MachineRef[],
): Promise<void> {
	if (machines.length === 0) return;

	const sb = supabaseAdmin();
	const rows = machines.map((m) => ({
		...refToRow(userId, m),
		updated_at: new Date().toISOString(),
	}));

	const { error } = await sb
		.from("machines")
		.upsert(rows, { onConflict: "id,user_id", ignoreDuplicates: true });

	if (error) throw new Error(`seedMachinesFromClerk: ${error.message}`);
}
