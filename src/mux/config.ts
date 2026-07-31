/**
 * Mux configuration: one JSON file with keys and routes, and it works.
 *
 * Resolution order for every credential:
 *   1. explicit value in the config object/file
 *   2. `env:NAME` indirection in the config
 *   3. conventional environment variable fallback
 *
 * Missing credentials never throw at load time -- providers report
 * `ready(): { ok: false, missing }` and the router skips them (fail
 * closed, never route to an arm we cannot authenticate against).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MuxError, type HarnessKind, type SubstrateKind, type UpstreamKeys } from "./types.js";

export type VercelSandboxCredentials = {
	token?: string;
	teamId?: string;
	projectId?: string;
	oidcToken?: string;
};

export type MuxProviderCredentials = {
	e2b?: { apiKey?: string };
	sprites?: { token?: string };
	vercel?: VercelSandboxCredentials;
	dedalus?: { apiKey?: string; baseUrl?: string };
};

export type MuxRoutePolicy = {
	primary: SubstrateKind;
	backups: SubstrateKind[];
};

export type MuxConfig = {
	keys: UpstreamKeys;
	providers: MuxProviderCredentials;
	sandboxes: MuxRoutePolicy;
	agents: { default: HarnessKind };
	defaults: {
		model?: string;
		timeoutMs: number;
	};
};

export type MuxConfigInput = {
	keys?: Partial<Record<keyof UpstreamKeys, string>>;
	providers?: {
		e2b?: { apiKey?: string } | string;
		sprites?: { token?: string } | string;
		vercel?: VercelSandboxCredentials;
		dedalus?: { apiKey?: string; baseUrl?: string } | string;
	};
	sandboxes?: { primary?: SubstrateKind; backups?: SubstrateKind[] };
	agents?: { default?: HarnessKind };
	defaults?: { model?: string; timeoutMs?: number };
};

export const SUBSTRATE_KINDS: readonly SubstrateKind[] = [
	"e2b",
	"sprites",
	"vercel",
	"dedalus",
];

export const HARNESS_KINDS: readonly HarnessKind[] = [
	"claude-code",
	"codex",
	"openclaw",
	"hermes",
];

const CONFIG_FILENAMES = ["agent-machines.json", "am.config.json"];

function expand(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	if (value.startsWith("env:")) {
		const name = value.slice(4);
		return process.env[name] || undefined;
	}
	return value;
}

function fromEnv(...names: string[]): string | undefined {
	for (const name of names) {
		const value = process.env[name];
		if (value) return value;
	}
	return undefined;
}

function asObject<T>(value: T | string | undefined, key: string): T | undefined {
	if (value === undefined) return undefined;
	if (typeof value === "string") {
		return { [key]: value } as T;
	}
	return value;
}

export function resolveMuxConfig(input: MuxConfigInput = {}): MuxConfig {
	const providersIn = input.providers ?? {};
	const e2b = asObject<{ apiKey?: string }>(providersIn.e2b, "apiKey");
	const sprites = asObject<{ token?: string }>(providersIn.sprites, "token");
	const dedalus = asObject<{ apiKey?: string; baseUrl?: string }>(
		providersIn.dedalus,
		"apiKey",
	);
	const vercel = providersIn.vercel;

	const primary = input.sandboxes?.primary ?? "e2b";
	const backups =
		input.sandboxes?.backups ??
		SUBSTRATE_KINDS.filter((kind) => kind !== primary);
	for (const kind of [primary, ...backups]) {
		if (!SUBSTRATE_KINDS.includes(kind)) {
			throw new MuxError("fatal", `Unknown sandbox kind in config: ${kind}`);
		}
	}
	const defaultAgent = input.agents?.default ?? "claude-code";
	if (!HARNESS_KINDS.includes(defaultAgent)) {
		throw new MuxError("fatal", `Unknown agent kind in config: ${defaultAgent}`);
	}

	return {
		keys: {
			anthropic: expand(input.keys?.anthropic) ?? fromEnv("ANTHROPIC_API_KEY"),
			openai: expand(input.keys?.openai) ?? fromEnv("OPENAI_API_KEY"),
			aiGateway:
				expand(input.keys?.aiGateway) ??
				fromEnv("AI_GATEWAY_API_KEY", "AI_GATEWAY_KEY"),
			openrouter: expand(input.keys?.openrouter) ?? fromEnv("OPENROUTER_API_KEY"),
		},
		providers: {
			e2b: { apiKey: expand(e2b?.apiKey) ?? fromEnv("E2B_API_KEY") },
			sprites: {
				token:
					expand(sprites?.token) ?? fromEnv("SPRITES_TOKEN", "SPRITES_API_KEY"),
			},
			vercel: {
				token: expand(vercel?.token) ?? fromEnv("VERCEL_TOKEN"),
				teamId: expand(vercel?.teamId) ?? fromEnv("VERCEL_TEAM_ID"),
				projectId: expand(vercel?.projectId) ?? fromEnv("VERCEL_PROJECT_ID"),
				oidcToken: expand(vercel?.oidcToken) ?? fromEnv("VERCEL_OIDC_TOKEN"),
			},
			dedalus: {
				apiKey: expand(dedalus?.apiKey) ?? fromEnv("DEDALUS_API_KEY"),
				baseUrl:
					expand(dedalus?.baseUrl) ??
					fromEnv("DEDALUS_BASE_URL") ??
					"https://dcs.dedaluslabs.ai",
			},
		},
		sandboxes: { primary, backups },
		agents: { default: defaultAgent },
		defaults: {
			model: input.defaults?.model,
			timeoutMs: input.defaults?.timeoutMs ?? 300_000,
		},
	};
}

/** Load config from a JSON file, or discover one in cwd. */
export function loadMuxConfig(path?: string, cwd = process.cwd()): MuxConfig {
	if (path) {
		return resolveMuxConfig(readJson(resolve(cwd, path)));
	}
	for (const name of CONFIG_FILENAMES) {
		try {
			return resolveMuxConfig(readJson(resolve(cwd, name)));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw error;
		}
	}
	return resolveMuxConfig({});
}

function readJson(absolute: string): MuxConfigInput {
	const raw = readFileSync(absolute, "utf8");
	try {
		return JSON.parse(raw) as MuxConfigInput;
	} catch (error) {
		throw new MuxError(
			"fatal",
			`Invalid JSON in ${absolute}: ${(error as Error).message}`,
		);
	}
}
