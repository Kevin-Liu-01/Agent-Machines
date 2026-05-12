/**
 * Server-side env loading. Reads AGENT_API_URL + AGENT_API_KEY exactly once
 * and exposes them as `serverConfig`. Throws at import time if a deploy was
 * forgotten so the dev server fails loudly rather than 401-ing every request.
 *
 * Legacy HERMES_* env names are still accepted for backward compatibility.
 */

type ServerConfig = {
	apiUrl: string;
	apiKey: string;
	model: string;
};

let cached: ServerConfig | null = null;

export function getServerConfig(): ServerConfig {
	if (cached) return cached;

	const apiUrl = (process.env.AGENT_API_URL ?? process.env.HERMES_API_URL)?.trim();
	const apiKey = (process.env.AGENT_API_KEY ?? process.env.HERMES_API_KEY)?.trim();
	const model = (process.env.AGENT_MODEL ?? process.env.HERMES_MODEL)?.trim() || "hermes-agent";

	if (!apiUrl) {
		throw new Error(
			"AGENT_API_URL not set. Copy .env.local.example to .env.local and paste the URL printed by `npm run deploy` (it ends in `/v1`).",
		);
	}
	if (!apiKey || apiKey === "hp-replace-me") {
		throw new Error(
			"AGENT_API_KEY not set. Paste the bearer token printed by `npm run deploy` into .env.local.",
		);
	}

	cached = { apiUrl: apiUrl.replace(/\/$/, ""), apiKey, model };
	return cached;
}
