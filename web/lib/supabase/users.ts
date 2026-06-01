import { supabaseAdmin } from "./client";

export type UserRow = {
	id: string;
	email: string | null;
	display_name: string | null;
	active_machine_id: string | null;
	setup_step: string;
	draft_agent_kind: string;
	draft_provider_kind: string;
	draft_model: string;
	draft_spec: Record<string, unknown>;
	active_loadout_preset_id: string;
	agent_profiles: unknown[];
	gateway_profiles: unknown[];
	environment_profiles: unknown[];
	bootstrap_presets: unknown[];
	custom_loadout: unknown[];
	loadout_sources: unknown[];
	loadout_presets: unknown[];
	memory_bundles: unknown[];
	workers: unknown[];
	created_at: string;
	updated_at: string;
};

export async function ensureUser(
	userId: string,
	email?: string | null,
	displayName?: string | null,
): Promise<UserRow> {
	const sb = supabaseAdmin();
	const { data, error } = await sb
		.from("users")
		.upsert(
			{
				id: userId,
				...(email ? { email } : {}),
				...(displayName ? { display_name: displayName } : {}),
				updated_at: new Date().toISOString(),
			},
			{ onConflict: "id" },
		)
		.select()
		.single();

	if (error) throw new Error(`ensureUser: ${error.message}`);
	return data as UserRow;
}

export async function getUser(userId: string): Promise<UserRow | null> {
	const sb = supabaseAdmin();
	const { data, error } = await sb
		.from("users")
		.select("*")
		.eq("id", userId)
		.maybeSingle();

	if (error) throw new Error(`getUser: ${error.message}`);
	return data as UserRow | null;
}

export type UserConfigPatch = Partial<
	Pick<
		UserRow,
		| "active_machine_id"
		| "setup_step"
		| "draft_agent_kind"
		| "draft_provider_kind"
		| "draft_model"
		| "draft_spec"
		| "active_loadout_preset_id"
		| "agent_profiles"
		| "gateway_profiles"
		| "environment_profiles"
		| "bootstrap_presets"
		| "custom_loadout"
		| "loadout_sources"
		| "loadout_presets"
		| "memory_bundles"
		| "workers"
		| "email"
		| "display_name"
	>
>;

export async function updateUser(
	userId: string,
	patch: UserConfigPatch,
): Promise<void> {
	const sb = supabaseAdmin();
	const { error } = await sb
		.from("users")
		.update({ ...patch, updated_at: new Date().toISOString() })
		.eq("id", userId);

	if (error) throw new Error(`updateUser: ${error.message}`);
}

/**
 * Read the full user row including config JSONB columns.
 * Returns null when the user hasn't been ensured yet.
 */
export async function getUserConfig(userId: string): Promise<UserRow | null> {
	const sb = supabaseAdmin();
	const { data, error } = await sb
		.from("users")
		.select("*")
		.eq("id", userId)
		.maybeSingle();

	if (error) throw new Error(`getUserConfig: ${error.message}`);
	return data as UserRow | null;
}

/**
 * Write config columns to the users table. Accepts the same
 * shape as updateUser but named explicitly for config writes
 * so call-sites are self-documenting.
 */
export async function updateUserConfigColumns(
	userId: string,
	patch: UserConfigPatch,
): Promise<void> {
	return updateUser(userId, patch);
}
