/**
 * Binding-layer tests for the four thin adapters (ROADMAP 0.2).
 *
 * The vendor halves are DELETED: each web adapter is now a binding over the
 * real mux provider ("agent-machines/mux/providers/<kind>"), so these tests
 * cover exactly what the binding owns -- credential mapping, the
 * ProvisionInput -> CreateSandboxOptions mapping, the describe() derivation
 * (including the sprites state override), no-wake delegation, and cache
 * scoping. The mux providers' own behavior (retry policy, error taxonomy,
 * no-wake proofs) is pinned by src/mux/providers/conformance.test.ts and
 * friends; re-testing it here would just duplicate that suite against mocks.
 *
 * The provider factories are vi.mock'ed at the exact boundary the bindings
 * import, which is what lets a test assert "the binding handed the mux THESE
 * credentials" -- the property the sprites apiKey->token rename and the
 * vercel OIDC rule depend on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { machineHomeForProvider } from "@/lib/bootstrap/bootstrap-log";
import { homeFor } from "@/lib/storage/machine-paths";

import { clearHandleCache } from "./mux-facade";
import { MachineProviderError, type ProvisionInput } from "./types";

const mocks = vi.hoisted(() => ({
	createE2bProvider: vi.fn(),
	createSpritesProvider: vi.fn(),
	createVercelProvider: vi.fn(),
	createDaytonaProvider: vi.fn(),
}));

vi.mock("agent-machines/mux/providers/e2b", () => ({
	createE2bProvider: mocks.createE2bProvider,
}));
vi.mock("agent-machines/mux/providers/sprites", () => ({
	createSpritesProvider: mocks.createSpritesProvider,
}));
vi.mock("agent-machines/mux/providers/vercel", () => ({
	createVercelProvider: mocks.createVercelProvider,
}));
vi.mock("agent-machines/mux/providers/daytona", () => ({
	createDaytonaProvider: mocks.createDaytonaProvider,
}));

import { createHostedDaytonaProvider } from "./daytona";
import { getProvider } from "./index";
import { E2BProvider } from "./e2b";
import { SpritesProvider } from "./sprites";
import { VercelProvider } from "./vercel";

type FakeDescription = {
	state: string;
	rawPhase: string | null;
	createdAt?: string;
	lastError?: string;
	resources?: { vcpu?: number; memoryMib?: number; diskGib?: number };
	endAt?: string;
	lifecycle?: { onTimeout: "pause" | "kill"; autoResume: boolean };
};

function fakeHandle(id: string) {
	return {
		id,
		substrate: "fake",
		capabilities: {},
		exec: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0, durationMs: 1 })),
		execStream: vi.fn(async function* stream() {
			yield { type: "exit" as const, exitCode: 0 };
		}),
		execBackground: vi.fn(async () => {}),
		openPty: vi.fn(),
		writeFile: vi.fn(),
		publicUrl: vi.fn(async (port: number) => `https://preview-${port}.example`),
		state: vi.fn(async () => "ready" as const),
		sleep: vi.fn(async () => {}),
		wake: vi.fn(async () => {}),
		destroy: vi.fn(async () => {}),
	};
}

function fakeMuxProvider(
	kind: string,
	options: { described?: FakeDescription; noPark?: boolean } = {},
) {
	const handles = new Map<string, ReturnType<typeof fakeHandle>>();
	const handleFor = (id: string) => {
		const existing = handles.get(id);
		if (existing) return existing;
		const handle = fakeHandle(id);
		handles.set(id, handle);
		return handle;
	};
	return {
		kind,
		capabilities: {
			pty: "native",
			persistence: "always-on",
			reattach: true,
			publicUrl: true,
			streamingExec: true,
			detachedWork: "reliable",
		},
		ready: vi.fn(() => ({ ok: true, missing: [] })),
		create: vi.fn(async () => handleFor("sbx-new")),
		connect: vi.fn(async (id: string) => handleFor(id)),
		list: vi.fn(async () => []),
		describe: vi.fn(
			async (): Promise<FakeDescription> =>
				options.described ?? { state: "ready", rawPhase: "running" },
		),
		remove: vi.fn(async () => {}),
		...(options.noPark ? {} : { park: vi.fn(async () => {}) }),
		handleFor,
	};
}

const SPEC: ProvisionInput = {
	spec: { vcpu: 2, memoryMib: 4096, storageGib: 10 },
	name: "my-agent",
	agentKind: "hermes",
	model: "anthropic/claude-opus-4-8",
	env: { EXTRA: "1" },
};

beforeEach(() => {
	vi.clearAllMocks();
	clearHandleCache();
	delete process.env.VERCEL_OIDC_TOKEN;
	delete process.env.VERCEL_TOKEN;
	delete process.env.VERCEL_TEAM_ID;
	delete process.env.VERCEL_PROJECT_ID;
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("e2b binding", () => {
	it("passes actual lifecycle and expiration through to the hosted summary without waking", async () => {
		const provider = fakeMuxProvider("e2b", { described: { state: "ready", rawPhase: "running", endAt: "2026-09-09T07:03:46.106Z", lifecycle: { onTimeout: "kill", autoResume: false } } });
		mocks.createE2bProvider.mockReturnValue(provider);
		const summary = await new E2BProvider({ apiKey: "fixture-key" }).state("legacy-worker");
		expect(summary).toMatchObject({ endAt: "2026-09-09T07:03:46.106Z", lifecycle: { onTimeout: "kill", autoResume: false } });
		expect(provider.connect).not.toHaveBeenCalled();
	});
	it("hands the mux factory the config credential unchanged", () => {
		mocks.createE2bProvider.mockReturnValue(fakeMuxProvider("e2b"));
		void new E2BProvider({ apiKey: "e2b_key" });
		expect(mocks.createE2bProvider).toHaveBeenCalledWith({ apiKey: "e2b_key" });
	});

	it("throws the dashboard's own missing_credentials message without a key", () => {
		expect(() => new E2BProvider({ apiKey: "" })).toThrowError(
			/E2B_API_KEY is required/,
		);
	});

	it("provision pins HOME, agent env and the 1h lifetime over the mux default", async () => {
		const provider = fakeMuxProvider("e2b");
		mocks.createE2bProvider.mockReturnValue(provider);
		await new E2BProvider({ apiKey: "k" }).provision(SPEC);
		expect(provider.create).toHaveBeenCalledWith({
			name: "my-agent",
			// The mux default is 300s, which would park the sandbox mid-bootstrap.
			timeoutMs: 3_600_000,
			env: {
				HOME: "/home/user",
				AGENT_KIND: "hermes",
				AGENT_MODEL: "anthropic/claude-opus-4-8",
				EXTRA: "1",
			},
			resources: { vcpu: 2, memoryMib: 4096 },
		});
	});

	it("state rides the no-wake describe and reports only proven axes", async () => {
		const provider = fakeMuxProvider("e2b", {
			described: {
				state: "sleeping",
				rawPhase: "paused",
				resources: { vcpu: 2, memoryMib: 478 },
			},
		});
		mocks.createE2bProvider.mockReturnValue(provider);
		const summary = await new E2BProvider({ apiKey: "k" }).state("sbx-1");
		expect(summary).toEqual({
			id: "sbx-1",
			state: "sleeping",
			rawPhase: "paused",
			// No storageGib: e2b never reports disk, and the old adapter's
			// invented 0 is exactly what the derivation must not resurrect.
			spec: { vcpu: 2, memoryMib: 478 },
			createdAt: null,
			lastError: null,
		});
		// The 2026-05-18 no-wake rule: a status read must not open a connection.
		expect(provider.connect).not.toHaveBeenCalled();
	});

	it("sleeps and destroys by id through park/remove, never through connect", async () => {
		const provider = fakeMuxProvider("e2b");
		mocks.createE2bProvider.mockReturnValue(provider);
		const e2b = new E2BProvider({ apiKey: "k" });
		expect(e2b.capabilities.canSleep).toBe(true);
		await e2b.sleep("sbx-1");
		await e2b.destroy("sbx-1");
		expect(provider.park).toHaveBeenCalledWith("sbx-1");
		expect(provider.remove).toHaveBeenCalledWith("sbx-1");
		expect(provider.connect).not.toHaveBeenCalled();
	});

	it("keeps native openPty on the hosted class surface", async () => {
		const provider = fakeMuxProvider("e2b");
		mocks.createE2bProvider.mockReturnValue(provider);
		await new E2BProvider({ apiKey: "k" }).openPty("sbx-1", {
			command: "tmux attach-session -t amconsole",
		});
		expect(provider.connect).toHaveBeenCalledWith("sbx-1");
		expect(provider.handleFor("sbx-1").openPty).toHaveBeenCalledWith({
			command: "tmux attach-session -t amconsole",
		});
	});
});

describe("sprites binding", () => {
	it("renames the config apiKey onto the mux factory's token field", () => {
		mocks.createSpritesProvider.mockReturnValue(fakeMuxProvider("sprites"));
		void new SpritesProvider({ apiKey: "sprites_key" });
		expect(mocks.createSpritesProvider).toHaveBeenCalledWith({
			token: "sprites_key",
		});
	});

	it("keeps warm and cold sprites reading ready, so exec gates stay open", async () => {
		// Deliberate override of the mux's warm/cold -> sleeping mapping: sprites
		// auto-wake on exec, and isMachineRunning (state === "ready") is what
		// keeps exec routes from returning machine_offline for an idle sprite.
		for (const phase of ["warm", "cold"]) {
			clearHandleCache();
			const provider = fakeMuxProvider("sprites", {
				described: { state: "sleeping", rawPhase: phase },
			});
			mocks.createSpritesProvider.mockReturnValue(provider);
			const summary = await new SpritesProvider({ apiKey: "k" }).state("am-x");
			expect(summary.state, `phase ${phase}`).toBe("ready");
			expect(summary.rawPhase, "vendor word must survive the override").toBe(phase);
		}
	});

	it("does not override phases that are not auto-waking", async () => {
		const provider = fakeMuxProvider("sprites", {
			described: { state: "destroyed", rawPhase: null },
		});
		mocks.createSpritesProvider.mockReturnValue(provider);
		const summary = await new SpritesProvider({ apiKey: "k" }).state("am-gone");
		// Destroyed ids now RETURN (mux contract) instead of throwing transient,
		// so a deleted sprite stops looking like a perpetual probe failure.
		expect(summary.state).toBe("destroyed");
		expect(summary.rawPhase).toBe("destroyed");
	});

	it("reports no spec axes -- the platform-default 2/4096/100 lie is gone", async () => {
		const provider = fakeMuxProvider("sprites", {
			described: { state: "sleeping", rawPhase: "warm" },
		});
		mocks.createSpritesProvider.mockReturnValue(provider);
		const summary = await new SpritesProvider({ apiKey: "k" }).state("am-x");
		expect(summary.spec).toEqual({});
	});

	it("declares the unique-name rule so two machines never adopt one sprite", async () => {
		const provider = fakeMuxProvider("sprites");
		mocks.createSpritesProvider.mockReturnValue(provider);
		await new SpritesProvider({ apiKey: "k" }).provision(SPEC);
		expect(provider.create).toHaveBeenCalledWith({
			name: "my-agent",
			env: { EXTRA: "1" },
			onNameConflict: "unique",
		});
	});

	it("destroys by id through remove and never binds a park", async () => {
		const provider = fakeMuxProvider("sprites", { noPark: true });
		mocks.createSpritesProvider.mockReturnValue(provider);
		const sprites = new SpritesProvider({ apiKey: "k" });
		await sprites.destroy("am-x");
		expect(provider.remove).toHaveBeenCalledWith("am-x");
		expect(provider.connect).not.toHaveBeenCalled();
		expect(sprites.capabilities.canSleep).toBe(false);
		await expect(sprites.sleep("am-x")).rejects.toMatchObject({ kind: "not_supported" });
		expect(provider.connect).not.toHaveBeenCalled();
		expect(provider.describe).not.toHaveBeenCalled();
	});
});

describe("vercel binding", () => {
	it("passes only the tenant triple through even when deployment OIDC exists", () => {
		vi.stubEnv("VERCEL_OIDC_TOKEN", "host-oidc");
		mocks.createVercelProvider.mockReturnValue(fakeMuxProvider("vercel"));
		void new VercelProvider({ token: "t", teamId: "team", projectId: "prj" });
		expect(mocks.createVercelProvider).toHaveBeenCalledWith({
			token: "t",
			teamId: "team",
			projectId: "prj",
			// No user-supplied OIDC: the mux bridges oidcToken into process.env
			// (process-GLOBAL), so a per-user token here would leak across
			// tenants on a warm instance.
			oidcToken: undefined,
		});
	});

	it("rejects host env credentials when no tenant credentials are configured", () => {
		vi.stubEnv("VERCEL_TOKEN", "env-tok");
		vi.stubEnv("VERCEL_TEAM_ID", "env-team");
		vi.stubEnv("VERCEL_PROJECT_ID", "env-prj");
		mocks.createVercelProvider.mockReturnValue(fakeMuxProvider("vercel"));
		expect(() => new VercelProvider(null)).toThrow(MachineProviderError);
		expect(mocks.createVercelProvider).not.toHaveBeenCalled();
	});

	it("forwards deployment OIDC only for the server-resolved owner", () => {
		vi.stubEnv("VERCEL_OIDC_TOKEN", "oidc-token");
		mocks.createVercelProvider.mockReturnValue(fakeMuxProvider("vercel"));
		void new VercelProvider({ token: "", teamId: "", projectId: "", allowDeploymentCredentials: true });
		expect(mocks.createVercelProvider).toHaveBeenCalledWith(
			expect.objectContaining({ oidcToken: "oidc-token" }),
		);
	});

	it("throws missing_credentials with neither the triple nor OIDC", () => {
		expect(() => new VercelProvider(null)).toThrowError(MachineProviderError);
	});

	it("sleeps through park (no resume-to-stop) and destroys through remove", async () => {
		const provider = fakeMuxProvider("vercel");
		mocks.createVercelProvider.mockReturnValue(provider);
		const vercel = new VercelProvider({ token: "t", teamId: "tm", projectId: "p" });
		expect(vercel.capabilities.canSleep).toBe(true);
		await vercel.sleep("sbx-1");
		await vercel.destroy("sbx-1");
		expect(provider.park).toHaveBeenCalledWith("sbx-1");
		expect(provider.remove).toHaveBeenCalledWith("sbx-1");
		// The pre-0.2 sleep resumed a stopped sandbox in order to stop it.
		expect(provider.connect).not.toHaveBeenCalled();
	});

	it("provision pins the Vercel HOME and forwards both sizing axes", async () => {
		const provider = fakeMuxProvider("vercel");
		mocks.createVercelProvider.mockReturnValue(provider);
		await new VercelProvider({ token: "t", teamId: "tm", projectId: "p" }).provision(SPEC);
		expect(provider.create).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "my-agent",
				timeoutMs: 3_600_000,
				env: expect.objectContaining({ HOME: "/vercel/sandbox" }),
				resources: { vcpu: 2, memoryMib: 4096 },
			}),
		);
	});

	// The pin is an OVERRIDE of the sandbox's real home (measured 2026-08-05:
	// HOME=/home/vercel-sandbox, cwd=/vercel/sandbox), so its whole value is
	// agreeing with the path the rest of the hosted plane hardcodes. Pinning one
	// place and reading another would put the bootstrap tree where repair and
	// the log reader do not look.
	it("pins HOME to the machine home the rest of the plane reads", async () => {
		const provider = fakeMuxProvider("vercel");
		mocks.createVercelProvider.mockReturnValue(provider);
		await new VercelProvider({ token: "t", teamId: "tm", projectId: "p" }).provision(SPEC);
		// Both readers of the machine home must agree with each other and with
		// the pin, so a change to any one of the three fails here.
		expect(machineHomeForProvider("vercel")).toBe(homeFor("vercel"));
		expect(provider.create).toHaveBeenCalledWith(
			expect.objectContaining({
				env: expect.objectContaining({ HOME: machineHomeForProvider("vercel") }),
			}),
		);
	});
});

describe("Daytona binding", () => {
	it("keeps tenant keys, API URL, and target separate from deployment credentials", () => {
		mocks.createDaytonaProvider.mockReturnValue(fakeMuxProvider("daytona"));
		createHostedDaytonaProvider({ apiKey: "tenant-key", apiUrl: "https://app.daytona.io/api", target: "us" });
		expect(mocks.createDaytonaProvider).toHaveBeenCalledWith({ apiKey: "tenant-key", apiUrl: "https://app.daytona.io/api", target: "us" });
	});
	it("forwards requested allocation and pins the verified guest HOME", async () => {
		const provider = fakeMuxProvider("daytona");
		mocks.createDaytonaProvider.mockReturnValue(provider);
		await createHostedDaytonaProvider({ apiKey: "tenant-key" }).provision(SPEC);
		expect(provider.create).toHaveBeenCalledWith(expect.objectContaining({
			resources: { vcpu: 2, memoryMib: 4096, diskGib: 10 },
			env: expect.objectContaining({ HOME: "/home/daytona" }),
		}));
		expect(homeFor("daytona")).toBe("/home/daytona");
		expect(machineHomeForProvider("daytona")).toBe("/home/daytona");
	});
	it("reads and parks without connecting or waking the machine", async () => {
		const provider = fakeMuxProvider("daytona", { described: { state: "sleeping", rawPhase: "stopped", resources: { vcpu: 1, memoryMib: 2048, diskGib: 3 } } });
		mocks.createDaytonaProvider.mockReturnValue(provider);
		const hosted = createHostedDaytonaProvider({ apiKey: "tenant-key" });
		expect(hosted.capabilities.canSleep).toBe(true);
		expect((await hosted.state("dtn-machine")).spec).toEqual({ vcpu: 1, memoryMib: 2048, storageGib: 3 });
		await hosted.sleep("dtn-machine");
		expect(provider.park).toHaveBeenCalledWith("dtn-machine");
		expect(provider.connect).not.toHaveBeenCalled();
	});
	it("rejects the retired provider even when old credentials are present", () => {
		expect(() => getProvider("dedalus", { dedalus: { apiKey: "legacy-key" }, daytona: { apiKey: "new-key" } })).toThrow("retired");
		expect(mocks.createDaytonaProvider).not.toHaveBeenCalled();
	});
});
