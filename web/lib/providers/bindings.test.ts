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
	createDedalusProvider: vi.fn(),
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
vi.mock("agent-machines/mux/providers/dedalus", () => ({
	createDedalusProvider: mocks.createDedalusProvider,
}));

import { DedalusProvider } from "./dedalus";
import { E2BProvider } from "./e2b";
import { SpritesProvider } from "./sprites";
import { VercelProvider } from "./vercel";

type FakeDescription = {
	state: string;
	rawPhase: string | null;
	createdAt?: string;
	lastError?: string;
	resources?: { vcpu?: number; memoryMib?: number; diskGib?: number };
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
		await e2b.sleep("sbx-1");
		await e2b.destroy("sbx-1");
		expect(provider.park).toHaveBeenCalledWith("sbx-1");
		expect(provider.remove).toHaveBeenCalledWith("sbx-1");
		expect(provider.connect).not.toHaveBeenCalled();
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
		// sleep falls back to the handle (sprites have no park); on the mux
		// handle that is a state read, preserving the old adapter's no-op sleep.
		await sprites.sleep("am-x");
		expect(provider.connect).toHaveBeenCalledWith("am-x");
	});
});

describe("vercel binding", () => {
	it("passes the triple through and takes OIDC only from process.env", () => {
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

	it("falls back to the env triple when no creds are configured", () => {
		vi.stubEnv("VERCEL_TOKEN", "env-tok");
		vi.stubEnv("VERCEL_TEAM_ID", "env-team");
		vi.stubEnv("VERCEL_PROJECT_ID", "env-prj");
		mocks.createVercelProvider.mockReturnValue(fakeMuxProvider("vercel"));
		void new VercelProvider(null);
		expect(mocks.createVercelProvider).toHaveBeenCalledWith(
			expect.objectContaining({
				token: "env-tok",
				teamId: "env-team",
				projectId: "env-prj",
			}),
		);
	});

	it("constructs under OIDC alone and forwards the process-env token", () => {
		vi.stubEnv("VERCEL_OIDC_TOKEN", "oidc-token");
		mocks.createVercelProvider.mockReturnValue(fakeMuxProvider("vercel"));
		void new VercelProvider(null);
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

describe("dedalus binding", () => {
	it("hands the mux factory the apiKey and the baseUrl namespace", () => {
		mocks.createDedalusProvider.mockReturnValue(fakeMuxProvider("dedalus"));
		void new DedalusProvider({ apiKey: "dk", baseUrl: "https://alt.example" });
		expect(mocks.createDedalusProvider).toHaveBeenCalledWith({
			apiKey: "dk",
			baseUrl: "https://alt.example",
		});
	});

	it("refuses a disk request the mux clamp would silently shrink", async () => {
		const provider = fakeMuxProvider("dedalus");
		mocks.createDedalusProvider.mockReturnValue(provider);
		const dedalus = new DedalusProvider({ apiKey: "dk" });
		const error = await dedalus
			.provision({ spec: { vcpu: 1, memoryMib: 2048, storageGib: 50 } })
			.catch((err: unknown) => err);
		expect(error).toBeInstanceOf(MachineProviderError);
		expect((error as MachineProviderError).kind).toBe("not_supported");
		expect((error as MachineProviderError).message).toContain("50 GiB");
		// Fail closed BEFORE any vendor call.
		expect(provider.create).not.toHaveBeenCalled();
	});

	it("forwards a satisfiable disk request on the contract's new axis", async () => {
		const provider = fakeMuxProvider("dedalus");
		mocks.createDedalusProvider.mockReturnValue(provider);
		await new DedalusProvider({ apiKey: "dk" }).provision(SPEC);
		expect(provider.create).toHaveBeenCalledWith(
			expect.objectContaining({
				resources: { vcpu: 2, memoryMib: 4096, diskGib: 10 },
			}),
		);
	});

	it("keeps createPreview on the class surface for the runner's feature-detect", async () => {
		const provider = fakeMuxProvider("dedalus");
		mocks.createDedalusProvider.mockReturnValue(provider);
		const dedalus = new DedalusProvider({ apiKey: "dk" });
		expect("createPreview" in dedalus).toBe(true);
		await expect(dedalus.createPreview("dm-1", 8642)).resolves.toBe(
			"https://preview-8642.example",
		);
		expect(provider.handleFor("dm-1").publicUrl).toHaveBeenCalledWith(8642);
	});

	it("derives spec from the dedalus wire fields, storage included", async () => {
		const provider = fakeMuxProvider("dedalus", {
			described: {
				state: "ready",
				rawPhase: "running",
				createdAt: "2026-08-01T00:00:00.000Z",
				lastError: "OutOfCredits",
				resources: { vcpu: 1, memoryMib: 2048, diskGib: 10 },
			},
		});
		mocks.createDedalusProvider.mockReturnValue(provider);
		const summary = await new DedalusProvider({ apiKey: "dk" }).state("dm-1");
		expect(summary).toEqual({
			id: "dm-1",
			state: "ready",
			rawPhase: "running",
			spec: { vcpu: 1, memoryMib: 2048, storageGib: 10 },
			createdAt: "2026-08-01T00:00:00.000Z",
			lastError: "OutOfCredits",
		});
	});
});
