import type { AiProviderKeys } from "@/lib/user-config/schema";

/** Reuse a tenant key only for the endpoint it belongs to. */
export function keyForModelEndpoint(baseUrl: string, keys: AiProviderKeys): string {
	let endpoint: URL;
	try {
		endpoint = new URL(baseUrl);
	} catch {
		return "";
	}
	switch (endpoint.origin) {
		case "https://api.openai.com": return keys.openai ?? "";
		case "https://api.anthropic.com": return keys.anthropic ?? "";
		case "https://openrouter.ai": return keys.openrouter ?? "";
		case "https://ai-gateway.vercel.sh": return keys.vercelAiGateway ?? "";
		case "https://generativelanguage.googleapis.com": return keys.google ?? "";
	}
	if (!keys.custom?.url) return "";
	try {
		const configured = new URL(keys.custom.url);
		return endpoint.href.replace(/\/$/, "") === configured.href.replace(/\/$/, "")
			? keys.custom.key
			: "";
	} catch {
		return "";
	}
}
