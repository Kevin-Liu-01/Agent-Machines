import { clerkClient } from "@clerk/nextjs/server";
import { getOwnerDefaults } from "./clerk";
import { canUseDeploymentCredentials } from "./owner";
import { invalidateUserConfigCache } from "./request-cache";
import { toPublicConfig, type AiProviderSlug, type ProviderKind } from "./schema";
import { parseCredentialRemoval, type CredentialRemovalResult, type CredentialSelector } from "./credential-removal";

type Metadata = Record<string, unknown>;

/** Omission does not delete from Clerk's deep merge; only explicit null does. */
export function credentialRemovalTombstones(credentials: CredentialSelector[]): Metadata {
	const selected = parseCredentialRemoval({ credentials });
	if (!selected) throw new Error("Invalid credential selection.");
	const patch: Metadata = {};
	for (const selector of selected) {
		if (selector === "cursor") {
			patch.cursorApiKey = null;
		} else if (selector.startsWith("provider:")) {
			const provider = selector.slice("provider:".length);
			const providers = (patch.providers ??= {}) as Metadata;
			providers[provider] = null;
			if (provider === "dedalus") patch.dedalusApiKey = null;
		} else {
			const models = (patch.aiProviderKeys ??= {}) as Metadata;
			models[selector.slice("model:".length)] = null;
		}
	}
	return patch;
}

function isMetadata(value: unknown): value is Metadata {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/** Verify the stored fields, not a locally merged config or the mutation echo. */
export function credentialTombstonesAreAbsent(metadata: unknown, tombstones: Metadata): boolean {
	if (metadata === undefined || metadata === null) return true;
	if (!isMetadata(metadata)) return false;
	return Object.entries(tombstones).every(([key, value]) => value === null
		? metadata[key] === undefined || metadata[key] === null
		: credentialTombstonesAreAbsent(metadata[key], value as Metadata));
}

function remainingDeploymentDefaults(userId: string, selected: CredentialSelector[]): CredentialSelector[] {
	if (!canUseDeploymentCredentials(userId)) return [];
	const defaults = toPublicConfig(getOwnerDefaults());
	return selected.filter(selector => {
		if (selector === "cursor") return Boolean(process.env.CURSOR_API_KEY?.trim());
		if (selector.startsWith("provider:")) return defaults.providers[selector.slice("provider:".length) as ProviderKind].configured;
		return defaults.aiProviders[selector.slice("model:".length) as AiProviderSlug].configured;
	});
}

/** Called only after the HTTP route verifies a real, current Clerk session. */
export async function removeSavedCredentialsForUser(userId: string, credentials: CredentialSelector[]): Promise<CredentialRemovalResult> {
	const selected = parseCredentialRemoval({ credentials });
	if (!selected) throw new Error("Invalid credential selection.");
	const tombstones = credentialRemovalTombstones(selected);
	const client = await clerkClient();
	const before = await client.users.getUser(userId);
	if (before.id !== userId) throw new Error("Credential owner could not be verified.");
	try {
		// Do not spread old metadata or invoke the full config writer: those can
		// restore deleted copies or overwrite unrelated account state.
		await client.users.updateUserMetadata(userId, { privateMetadata: tombstones });
	} finally {
		// A failed response can still follow a successful write. Drop this
		// process's short-lived config cache even when persistence is uncertain.
		invalidateUserConfigCache();
	}
	const after = await client.users.getUser(userId);
	if (after.id !== userId || !isMetadata(after.privateMetadata) || !credentialTombstonesAreAbsent(after.privateMetadata, tombstones)) {
		throw new Error("Saved credential removal could not be verified.");
	}
	return { removed: selected, stillConfigured: remainingDeploymentDefaults(userId, selected) };
}
