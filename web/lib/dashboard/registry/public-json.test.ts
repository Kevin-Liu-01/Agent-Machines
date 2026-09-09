import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { IncomingMessage, RequestOptions, request as httpRequest } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicJson, isPublicAddress, publicManifestUrl } from "./public-json";

const address = { address: "93.184.216.34", family: 4 };
type ResponseSpec = { status?: number; headers?: Record<string, string | undefined>; chunks?: Buffer[]; stall?: boolean };
function transport(responses: ResponseSpec[]) {
	const calls: { url: URL; options: RequestOptions; response: PassThrough }[] = [];
	const fn = (url: URL, options: RequestOptions, callback: (res: IncomingMessage) => void) => {
		const spec = responses[calls.length] ?? {};
		const response = Object.assign(new PassThrough(), { statusCode: spec.status ?? 200, headers: spec.headers ?? {} });
		calls.push({ url, options, response });
		const req = Object.assign(new EventEmitter(), { end() {
			queueMicrotask(() => {
				callback(response as unknown as IncomingMessage);
				if (spec.stall) return;
				for (const chunk of spec.chunks ?? [Buffer.from('{"items":[]}')]) {
					if (!response.destroyed) response.write(chunk);
				}
				if (!response.destroyed) response.end();
			});
		} });
		return req;
	};
	return { calls, request: fn as unknown as typeof httpRequest };
}
afterEach(() => vi.useRealTimers());
describe("public JSON fetch safety", () => {
	it.each([
		"0.0.0.0", "10.0.0.1", "100.100.100.200", "127.0.0.1", "169.254.169.254", "172.16.1.1",
		"192.168.1.1", "192.0.0.1", "198.18.1.1", "203.0.113.1", "224.0.0.1", "255.255.255.255",
		"168.63.129.16", "::1", "::", "::ffff:127.0.0.1", "::ffff:8.8.8.8", "fc00::1", "fe80::1",
		"64:ff9b::7f00:1", "2001::1", "2001:db8::1", "2002:7f00:1::", "3fff::1", "ff00::1",
	])("rejects special or private address %s", (ip) => expect(isPublicAddress(ip)).toBe(false));
	it.each(["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111", "2001:4860:4860::8888"])("permits ordinary global address %s", (ip) => expect(isPublicAddress(ip)).toBe(true));
	it.each([
		"file:///etc/passwd", "ftp://example.org/file", "https://user:pass@example.org/a", "http://example.org:8080/a",
		"http://localhost/a", "http://LOCALHOST./a", "http://metadata.internal/a", "http://127.1/a",
		"http://2130706433/a", "http://0x7f000001/a", "http://[::ffff:127.0.0.1]/a",
	])("rejects unsafe URL %s before DNS or requests", async (url) => {
		const resolve = vi.fn(); const wire = transport([]);
		await expect(fetchPublicJson(url, { resolve, request: wire.request })).rejects.toThrow();
		expect(resolve).not.toHaveBeenCalled(); expect(wire.calls).toHaveLength(0);
	});
	it("pins the validated DNS result, keeps original TLS hostname, and sends no ambient credentials", async () => {
		const resolve = vi.fn().mockResolvedValueOnce([address]).mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
		const wire = transport([{}]);
		expect(await fetchPublicJson("https://manifest.company.org/catalog?Token=ABC", { resolve, request: wire.request })).toEqual({ items: [] });
		const { url, options } = wire.calls[0]!;
		expect(url.hostname).toBe("manifest.company.org"); expect(url.search).toBe("?Token=ABC");
		expect(options).toMatchObject({ agent: false, autoSelectFamily: false, family: 4,
			headers: { Accept: "application/json", "Accept-Encoding": "identity" } });
		const callback = vi.fn();
		options.lookup!(url.hostname, { all: false }, callback);
		options.lookup!(url.hostname, { all: false }, callback);
		expect(callback.mock.calls).toEqual([[null, address.address, 4], [null, address.address, 4]]);
		expect(resolve).toHaveBeenCalledTimes(1);
	});
	it("fails closed if any DNS answer is private", async () => {
		const wire = transport([]);
		await expect(fetchPublicJson("https://manifest.company.org/a", { request: wire.request,
			resolve: async () => [address, { address: "10.1.1.1", family: 4 }],
		})).rejects.toThrow("non-public");
		expect(wire.calls).toHaveLength(0);
	});
	it("revalidates redirect hostnames and never connects to their private answers", async () => {
		const resolve = vi.fn().mockResolvedValueOnce([address]).mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
		const wire = transport([{ status: 302, headers: { location: "https://metadata.company.org/secret" } }]);
		await expect(fetchPublicJson("https://manifest.company.org/a", { resolve, request: wire.request })).rejects.toThrow("non-public");
		expect(wire.calls).toHaveLength(1); expect(wire.calls[0]!.response.destroyed).toBe(true);
	});
	it("rejects literal private redirects and HTTPS downgrades", async () => {
		for (const location of ["http://127.0.0.1/a", "https://[::1]/a", "http://manifest.company.org/a"]) {
			const wire = transport([{ status: 302, headers: { location } }]);
			await expect(fetchPublicJson("https://manifest.company.org/a", { resolve: async () => [address], request: wire.request })).rejects.toThrow();
			expect(wire.calls).toHaveLength(1);
		}
	});
	it("permits relative redirects but caps redirect loops", async () => {
		const wire = transport([{ status: 302, headers: { location: "/new" } }, {}]);
		expect(await fetchPublicJson("https://manifest.company.org/a", { resolve: async () => [address], request: wire.request })).toEqual({ items: [] });
		expect(wire.calls[1]!.url.pathname).toBe("/new");
		const loop = transport(Array.from({ length: 5 }, () => ({ status: 302, headers: { location: "/again" } })));
		await expect(fetchPublicJson("https://manifest.company.org/a", { resolve: async () => [address], request: loop.request })).rejects.toThrow("too many redirects");
		expect(loop.calls).toHaveLength(4);
	});
	it("bounds declared and chunked response bodies and refuses compression", async () => {
		for (const spec of [
			{ headers: { "content-length": "1048577" } }, { headers: { "content-encoding": "gzip" } },
			{ chunks: [Buffer.alloc(1024 * 1024), Buffer.alloc(1)] },
		]) {
			const wire = transport([spec]);
			await expect(fetchPublicJson("https://manifest.company.org/a", { resolve: async () => [address], request: wire.request })).rejects.toThrow(/1 MiB/);
			expect(wire.calls[0]!.response.destroyed).toBe(true);
		}
	});
	it("rejects failed HTTP status and malformed JSON", async () => {
		for (const spec of [{ status: 500 }, { chunks: [Buffer.from("<html>not json</html>")] }]) {
			const wire = transport([spec]);
			await expect(fetchPublicJson("https://manifest.company.org/a", { resolve: async () => [address], request: wire.request })).rejects.toThrow();
		}
	});
	it("bounds DNS resolution with the same overall deadline", async () => {
		vi.useFakeTimers(); const wire = transport([]);
		const pending = fetchPublicJson("https://manifest.company.org/a", { request: wire.request, resolve: () => new Promise(() => {}) });
		const assertion = expect(pending).rejects.toThrow("timed out");
		await vi.advanceTimersByTimeAsync(10_001); await assertion;
		expect(wire.calls).toHaveLength(0);
	});
	it("aborts the underlying request if a response body stalls", async () => {
		vi.useFakeTimers(); const wire = transport([{ stall: true }]);
		const pending = fetchPublicJson("https://manifest.company.org/a", { request: wire.request, resolve: async () => [address] });
		const assertion = expect(pending).rejects.toThrow("timed out");
		await vi.advanceTimersByTimeAsync(10_001); await assertion;
		expect(wire.calls[0]!.options.signal?.aborted).toBe(true);
		wire.calls[0]!.response.destroy();
	});
	it("preserves case-sensitive paths and strips fragments", () => {
		expect(publicManifestUrl("https://manifest.company.org/Secret?Key=ABC#fragment").href).toBe("https://manifest.company.org/Secret?Key=ABC");
	});
});
