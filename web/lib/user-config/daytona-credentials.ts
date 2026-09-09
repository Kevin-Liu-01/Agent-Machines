/** Validate nonsecret connection settings without ever echoing submitted keys. */
export function daytonaCredentialsError(input: unknown): string | null {
	if (!input || typeof input !== "object" || Array.isArray(input)) return "Daytona credentials must be an object.";
	const fields = input as Record<string, unknown>;
	for (const name of ["apiKey", "apiUrl", "target"] as const) {
		if (fields[name] !== undefined && (typeof fields[name] !== "string" || fields[name].length > 4096)) return `Invalid Daytona ${name}.`;
	}
	const url = typeof fields.apiUrl === "string" ? fields.apiUrl.trim() : "";
	if (url) {
		try {
			const parsed = new URL(url);
			if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) return "Daytona API URL must be HTTPS, without credentials, query parameters, or a fragment.";
		} catch { return "Enter a valid Daytona API URL."; }
	}
	const target = typeof fields.target === "string" ? fields.target.trim() : "";
	if (target && !/^[a-zA-Z0-9_-]{1,64}$/.test(target)) return "Invalid Daytona target.";
	return null;
}
