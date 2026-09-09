import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";

const MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;
const excluded = new BlockList();
// Conservative exclusions from the IANA special-purpose registries. Public
// manifests do not need local, transition, documentation, or multicast space.
for (const [address, prefix] of [
	["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
	["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
	["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
	["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) excluded.addSubnet(address, prefix, "ipv4");
excluded.addAddress("168.63.129.16", "ipv4"); // Azure host/platform virtual address.
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [
	["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20],
] as const) excluded.addSubnet(address, prefix, "ipv6");

export function isPublicAddress(address: string): boolean {
	const family = isIP(address);
	if (family === 4) return !excluded.check(address, "ipv4");
	if (family === 6) return globalV6.check(address, "ipv6") && !excluded.check(address, "ipv6");
	return false;
}

export function publicManifestUrl(input: string): URL {
	if (input.length > 2048) throw new Error("Manifest URL is too long.");
	const url = new URL(input);
	if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) {
		throw new Error("Manifest URLs must use public HTTP(S), standard ports, and no embedded credentials.");
	}
	const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
	if (!host || (isIP(host) ? !isPublicAddress(host) :
		(!host.includes(".") || /(^|\.)(localhost|local|internal|lan|home|test|invalid|example)$/.test(host)))) {
		throw new Error("Manifest URL must point to a public internet host.");
	}
	url.hash = "";
	return url;
}

type Address = { address: string; family: number };
type Dependencies = {
	resolve?: (hostname: string) => Promise<Address[]>;
	request?: typeof httpRequest;
};

/** A fixed-address lookup prevents a second DNS resolution from rebinding the
 * validated hostname. Host/SNI and TLS verification still use the original URL.
 * No proxy, cookie jar, credentials, automatic redirects, or decompression. */
function requestJson(url: URL, address: Address, signal: AbortSignal, request: typeof httpRequest): Promise<{ body?: string; location?: string }> {
	return new Promise((resolve, reject) => {
		const pinnedLookup: RequestOptions["lookup"] = (_host, _options, callback) => {
			callback(null, address.address, address.family);
		};
		const options: RequestOptions & { autoSelectFamily: boolean } = {
			method: "GET", agent: false, family: address.family, autoSelectFamily: false,
			lookup: pinnedLookup, signal, maxHeaderSize: 16 * 1024,
			headers: { Accept: "application/json", "Accept-Encoding": "identity" },
		};
		const req = request(url, options, (res: IncomingMessage) => {
			res.on("error", reject);
			const status = res.statusCode ?? 0;
			if ([301, 302, 303, 307, 308].includes(status)) {
				const location = res.headers.location;
				res.destroy();
				if (location) resolve({ location });
				else reject(new Error("Manifest redirect has no destination."));
				return;
			}
			if (status < 200 || status >= 300) {
				res.destroy(); reject(new Error(`Manifest fetch returned HTTP ${status}.`)); return;
			}
			if ((res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity") ||
				Number(res.headers["content-length"] ?? 0) > MAX_BYTES) {
				res.destroy(); reject(new Error("Manifest response is encoded or exceeds 1 MiB.")); return;
			}
			const chunks: Buffer[] = [];
			let bytes = 0;
			res.on("data", (chunk: Buffer) => {
				bytes += chunk.length;
				if (bytes > MAX_BYTES) {
					res.destroy(); reject(new Error("Manifest response exceeds 1 MiB.")); return;
				}
				chunks.push(chunk);
			});
			res.on("end", () => resolve({ body: Buffer.concat(chunks).toString("utf8") }));
		});
		req.on("error", reject);
		req.end();
	});
}

/** Fetch only public JSON; the deadline covers DNS, redirects, headers and body. */
export async function fetchPublicJson(input: string, dependencies: Dependencies = {}): Promise<unknown> {
	let url = publicManifestUrl(input);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(new Error("Manifest fetch timed out.")), TIMEOUT_MS);
	const signal = controller.signal;
	let onAbort: (() => void) | undefined;
	const aborted = new Promise<never>((_, reject) => {
		onAbort = () => reject(new Error("Manifest fetch timed out."));
		signal.addEventListener("abort", onAbort, { once: true });
	});
	try {
		for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
			const host = url.hostname.replace(/^\[|\]$/g, "");
			const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await Promise.race([
				(dependencies.resolve ?? ((name) => lookup(name, { all: true, verbatim: true })))(host), aborted,
			]);
			if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address) || isIP(entry.address) !== entry.family)) {
				throw new Error("Manifest host resolved to a non-public address.");
			}
			const response = await Promise.race([
				requestJson(url, addresses[0]!, signal, dependencies.request ?? (url.protocol === "https:" ? httpsRequest : httpRequest)), aborted,
			]);
			if (response.location) {
				if (hop === MAX_REDIRECTS) throw new Error("Manifest has too many redirects.");
				const next = publicManifestUrl(new URL(response.location, url).href);
				if (url.protocol === "https:" && next.protocol !== "https:") throw new Error("Manifest redirect cannot downgrade HTTPS.");
				url = next;
				continue;
			}
			try { return JSON.parse(response.body ?? ""); }
			catch { throw new Error("Manifest response must be valid JSON."); }
		}
		throw new Error("Manifest has too many redirects.");
	} finally {
		clearTimeout(timer);
		if (onAbort) signal.removeEventListener("abort", onAbort);
	}
}
