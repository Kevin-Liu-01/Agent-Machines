/** Client-safe selectors for removing saved account credentials, not vendor keys. */
export const CREDENTIAL_OPTIONS = [
	{ id: "provider:daytona", label: "Daytona", group: "provider" },
	{ id: "provider:e2b", label: "E2B", group: "provider" },
	{ id: "provider:sprites", label: "Sprites", group: "provider" },
	{ id: "provider:vercel", label: "Vercel Sandbox", group: "provider" },
	{ id: "provider:dedalus", label: "Dedalus (retired)", group: "provider" },
	{ id: "model:anthropic", label: "Anthropic", group: "model" },
	{ id: "model:openai", label: "OpenAI", group: "model" },
	{ id: "model:openrouter", label: "OpenRouter", group: "model" },
	{ id: "model:google", label: "Google", group: "model" },
	{ id: "model:vercelAiGateway", label: "Vercel AI Gateway", group: "model" },
	{ id: "model:custom", label: "Custom model endpoint", group: "model" },
	{ id: "cursor", label: "Cursor", group: "tool" },
] as const;

export type CredentialSelector = (typeof CREDENTIAL_OPTIONS)[number]["id"];

export type CredentialRemovalResult = {
	/** These selected account-storage slots were verified absent after removal. */
	removed: CredentialSelector[];
	/** Selected slots still supplied by this user's owner-only deployment defaults. */
	stillConfigured: CredentialSelector[];
};

const selectors: ReadonlySet<string> = new Set(CREDENTIAL_OPTIONS.map(option => option.id));

/** All input validation completes before credentials or their store are accessed. */
export function parseCredentialRemoval(input: unknown): CredentialSelector[] | null {
	if (!input || typeof input !== "object" || Array.isArray(input)) return null;
	const body = input as Record<string, unknown>;
	if (Object.keys(body).length !== 1 || !Object.hasOwn(body, "credentials")) return null;
	if (!Array.isArray(body.credentials) || body.credentials.length < 1 || body.credentials.length > CREDENTIAL_OPTIONS.length) return null;
	if (!body.credentials.every(value => typeof value === "string" && selectors.has(value))) return null;
	return [...new Set(body.credentials)] as CredentialSelector[];
}
