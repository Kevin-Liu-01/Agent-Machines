/**
 * Sprites.dev provider.
 *
 * Sprites is Fly.io's newer product for stateful sandboxes. Each sprite
 * gets a persistent ext4 filesystem, auto-sleeps when idle (no compute
 * charges), and auto-wakes on exec or HTTP request. The sprite URL
 * proxies to port 8080 inside the sandbox by default.
 *
 * Auth: `Authorization: Bearer $SPRITE_TOKEN`
 * REST API: https://api.sprites.dev/v1
 */

import {
	MachineProviderError,
	type ExecOptions,
	type ExecResult,
	type MachineProvider,
	type ProviderCapabilities,
	type ProviderMachineSummary,
	type ProvisionInput,
	type ProvisionResult,
} from "./types";

export type SpritesCreds = {
	apiKey: string;
};

const API = "https://api.sprites.dev/v1";

type SpriteInfo = {
	id: string;
	name: string;
	url: string;
	status: string;
};

type ExecResponse = {
	stdout?: string;
	stderr?: string;
	exit_code?: number;
	exitCode?: number;
	output?: string;
};

function mapState(status: string | undefined): ProviderMachineSummary["state"] {
	switch (status) {
		case "running":
		case "warm":
		case "cold":
			// Sprites auto-wake on exec/HTTP, so warm and cold are
			// effectively "ready" from the dashboard's perspective.
			// Mapping them to "ready" prevents isMachineRunning from
			// blocking exec calls that would auto-wake the sprite.
			return "ready";
		default:
			return "unknown";
	}
}

export class SpritesProvider implements MachineProvider {
	readonly kind = "sprites" as const;
	readonly capabilities: ProviderCapabilities = {
		runtime: "persistent-machine",
		canProvision: true,
		canWake: true,
		canSleep: true,
		canDestroy: true,
		canExec: true,
		hasPersistentDisk: true,
		usesExternalStorage: false,
	};
	private readonly apiKey: string;

	constructor(creds: SpritesCreds) {
		if (!creds.apiKey) {
			throw new MachineProviderError(
				"sprites",
				"missing_credentials",
				"Sprites token is required for the Sprites provider.",
			);
		}
		this.apiKey = creds.apiKey;
	}

	get hasCredentials(): boolean {
		return Boolean(this.apiKey);
	}

	async provision(input: ProvisionInput): Promise<ProvisionResult> {
		const name = spriteNameFor(input.name);
		const response = await this.fetch("/sprites", {
			method: "POST",
			body: JSON.stringify({
				name,
				url_settings: { auth: "public" },
			}),
		});
		if (!response.ok) {
			throw await this.error("provision", response);
		}
		const sprite = (await response.json()) as SpriteInfo;
		return {
			id: sprite.name,
			state: mapState(sprite.status),
			rawPhase: sprite.status ?? "unknown",
		};
	}

	async state(spriteName: string): Promise<ProviderMachineSummary> {
		const response = await this.fetch(`/sprites/${spriteName}`);
		if (!response.ok) {
			throw await this.error("state", response);
		}
		const sprite = (await response.json()) as SpriteInfo;
		return this.summary(sprite);
	}

	async wake(spriteName: string): Promise<ProviderMachineSummary> {
		// Sprites auto-wake on exec. Return current state -- the next exec
		// will trigger a wake automatically if the sprite is cold/warm.
		return this.state(spriteName);
	}

	async sleep(spriteName: string): Promise<ProviderMachineSummary> {
		// Sprites auto-sleep when idle. There is no manual sleep API;
		// returning current state is correct behavior.
		return this.state(spriteName);
	}

	async destroy(spriteName: string): Promise<void> {
		const response = await this.fetch(`/sprites/${spriteName}`, {
			method: "DELETE",
		});
		if (!response.ok && response.status !== 404) {
			throw await this.error("destroy", response);
		}
	}

	async exec(
		spriteName: string,
		command: string,
		_options?: ExecOptions,
	): Promise<ExecResult> {
		// Sprites exec is WebSocket-based, not REST. Use the @fly/sprites
		// SDK which handles the binary WS protocol automatically.
		try {
			const { SpritesClient } = await import("@fly/sprites");
			const client = new SpritesClient(this.apiKey);
			const sprite = client.sprite(spriteName);
			const result = await sprite.exec(command);
			const stdout = result.stdout ? String(result.stdout) : "";
			const stderr = result.stderr ? String(result.stderr) : "";
			return {
				stdout: stdout.trim(),
				stderr: stderr.trim(),
				exitCode: result.exitCode ?? 0,
			};
		} catch (err: unknown) {
			// The SDK throws ExecError on non-zero exit codes, but the
			// error.result still contains stdout/stderr/exitCode. Extract
			// it so callers get the actual command output.
			const execResult = (err as { result?: { stdout?: unknown; stderr?: unknown; exitCode?: number } }).result;
			if (execResult && typeof execResult.exitCode === "number") {
				return {
					stdout: execResult.stdout ? String(execResult.stdout).trim() : "",
					stderr: execResult.stderr ? String(execResult.stderr).trim() : "",
					exitCode: execResult.exitCode,
				};
			}
			const message = err instanceof Error ? err.message : String(err);
			throw new MachineProviderError(
				"sprites",
				message.includes("404") ? "fatal" : "transient",
				`sprites exec failed: ${message.slice(0, 200)}`,
			);
		}
	}

	async getPublicUrl(spriteName: string, _port: number): Promise<string | null> {
		const response = await this.fetch(`/sprites/${spriteName}`);
		if (!response.ok) return null;
		const sprite = (await response.json()) as SpriteInfo;
		return sprite.url ?? null;
	}

	private async fetch(path: string, init?: RequestInit): Promise<Response> {
		return fetch(`${API}${path}`, {
			...init,
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				"Content-Type": "application/json",
				...(init?.headers ?? {}),
			},
			cache: "no-store",
		});
	}

	private summary(sprite: SpriteInfo): ProviderMachineSummary {
		return {
			id: sprite.name,
			state: mapState(sprite.status),
			rawPhase: sprite.status ?? "unknown",
			spec: {
				vcpu: 2,
				memoryMib: 4096,
				storageGib: 100,
			},
			createdAt: null,
			lastError: null,
		};
	}

	private async error(op: string, response: Response): Promise<MachineProviderError> {
		const text = await response.text().catch(() => "");
		return new MachineProviderError(
			"sprites",
			response.status === 429 ? "rate_limited" : "transient",
			`Sprites ${op} ${response.status}: ${text.slice(0, 240)}`,
		);
	}
}

function spriteNameFor(name: string | undefined): string {
	const suffix = Math.random().toString(36).slice(2, 10);
	const base = (name ?? "agent")
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 32);
	return `am-${base || "agent"}-${suffix}`;
}
