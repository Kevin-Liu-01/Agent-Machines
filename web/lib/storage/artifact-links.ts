/** Keep file actions pinned to the machine the user is viewing. */
export function artifactUrl(machineId: string, id?: string, download = false): string {
	const path = id ? `/${encodeURIComponent(id)}${download ? "/download" : ""}` : "";
	return `/api/dashboard/artifacts${path}?${new URLSearchParams({ machineId })}`;
}

/** Only passive formats may render directly on the application's origin. */
export function artifactContentType(mime: string): string {
	const type = mime.toLowerCase().split(";", 1)[0].trim();
	if (["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"].includes(type)) return type;
	if (type.startsWith("text/") || ["application/json", "application/xml", "image/svg+xml"].includes(type)) {
		return "text/plain; charset=utf-8";
	}
	return "application/octet-stream";
}

export function artifactDisposition(name: string): string {
	const fallback = name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "artifact";
	const encoded = encodeURIComponent(name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
	return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
