import { describe, expect, it } from "vitest";
import { artifactContentType, artifactDisposition, artifactUrl } from "./artifact-links";

describe("machine-scoped artifact actions", () => {
	it("pins listing, deletion and downloading to the viewed machine", () => {
		expect(artifactUrl("viewed-worker")).toBe("/api/dashboard/artifacts?machineId=viewed-worker");
		expect(artifactUrl("viewed-worker", "file")).toBe("/api/dashboard/artifacts/file?machineId=viewed-worker");
		expect(artifactUrl("viewed-worker", "file", true)).toBe("/api/dashboard/artifacts/file/download?machineId=viewed-worker");
	});
	it("encodes identifiers rather than allowing path/query injection", () => {
		const url = new URL(artifactUrl("m&machineId=other", "a/b?x=y", true), "https://example.test");
		expect(url.pathname).toBe("/api/dashboard/artifacts/a%2Fb%3Fx%3Dy/download");
		expect(url.searchParams.getAll("machineId")).toEqual(["m&machineId=other"]);
	});
	it.each(["text/html", "image/svg+xml", "application/xml", "text/javascript"])("never serves active %s on the application origin", (mime) => {
		expect(artifactContentType(mime)).toBe("text/plain; charset=utf-8");
	});
	it("keeps raster previews and forces unknown types to download", () => {
		expect(artifactContentType("image/png")).toBe("image/png");
		expect(artifactContentType("application/pdf")).toBe("application/octet-stream");
	});
	it("uses a safe attachment header while preserving Unicode filenames", () => {
		const header = artifactDisposition('résumé"\r\n.html');
		expect(header).toMatch(/^attachment; filename="/);
		expect(header).not.toMatch(/[\r\n]/);
		expect(header).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9%22%0D%0A.html");
	});
});
