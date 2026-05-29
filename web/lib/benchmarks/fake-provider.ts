/**
 * FakeProvider — a `MachineProvider` with synthetic, configurable timings.
 *
 * Used by tests (deterministic, no network) and by the `--demo` flag of
 * the benchmark CLI so the dashboard can be developed without spending
 * real provider credits. Demo output is always tagged `source: "demo"`
 * so it can never be mistaken for a measured run.
 */

import type {
	ExecOptions,
	ExecResult,
	MachineProvider,
	MachineState,
	ProviderCapabilities,
	ProviderMachineSummary,
	ProvisionInput,
	ProvisionResult,
} from "@/lib/providers/types";
import type { MachineSpec, ProviderKind } from "@/lib/user-config/schema";

import {
	CPU_BENCH_COMMAND,
	DISK_READ_COMMAND,
	DISK_WRITE_COMMAND,
} from "./constants";

export type FakeProfile = {
	/** Artificial latency injected on provision/exec/etc. (ms). */
	provisionMs: number;
	readyDelayMs: number;
	execMs: number;
	wakeMs: number;
	teardownMs: number;
	cpuMops: number;
	diskWriteMbps: number;
	diskReadMbps: number;
	/** Probability a given exec "fails" (0..1) to exercise error paths. */
	failRate?: number;
	jitter?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function jittered(base: number, jitter = 0.1): number {
	const delta = base * jitter;
	return base + (Math.random() * 2 - 1) * delta;
}

export class FakeProvider implements MachineProvider {
	readonly kind: ProviderKind;
	readonly capabilities: ProviderCapabilities;
	readonly hasCredentials = true;
	private readonly profile: FakeProfile;
	private state_: MachineState = "destroyed";
	private readonly spec: MachineSpec;
	/** When > 0, used to slow synthetic time so tests stay fast. */
	private readonly timeScale: number;

	constructor(
		kind: ProviderKind,
		profile: FakeProfile,
		opts: { capabilities?: Partial<ProviderCapabilities>; timeScale?: number } = {},
	) {
		this.kind = kind;
		this.profile = profile;
		this.timeScale = opts.timeScale ?? 0;
		this.spec = { vcpu: 2, memoryMib: 4096, storageGib: 10 };
		this.capabilities = {
			runtime: "persistent-machine",
			canProvision: true,
			canWake: true,
			canSleep: true,
			canDestroy: true,
			canExec: true,
			hasPersistentDisk: true,
			usesExternalStorage: false,
			...opts.capabilities,
		};
	}

	private async wait(ms: number): Promise<void> {
		if (this.timeScale > 0) await sleep(ms * this.timeScale);
	}

	async provision(_input: ProvisionInput): Promise<ProvisionResult> {
		await this.wait(this.profile.provisionMs);
		this.state_ = "starting";
		// Become ready shortly after, mimicking a placement delay.
		setTimeout(() => {
			this.state_ = "ready";
		}, this.timeScale > 0 ? this.profile.readyDelayMs * this.timeScale : 0);
		if (this.timeScale === 0) this.state_ = "ready";
		return {
			id: `fake-${this.kind}-${Math.random().toString(36).slice(2, 10)}`,
			state: "starting",
			rawPhase: "starting",
		};
	}

	async state(machineId: string): Promise<ProviderMachineSummary> {
		return {
			id: machineId,
			state: this.state_,
			rawPhase: this.state_,
			spec: this.spec,
			createdAt: new Date().toISOString(),
			lastError: null,
		};
	}

	async wake(machineId: string): Promise<ProviderMachineSummary> {
		await this.wait(this.profile.wakeMs);
		this.state_ = "ready";
		return this.state(machineId);
	}

	async sleep(machineId: string): Promise<ProviderMachineSummary> {
		this.state_ = "sleeping";
		return this.state(machineId);
	}

	async destroy(_machineId: string): Promise<void> {
		await this.wait(this.profile.teardownMs);
		this.state_ = "destroyed";
	}

	async exec(
		_machineId: string,
		command: string,
		_options?: ExecOptions,
	): Promise<ExecResult> {
		await this.wait(this.profile.execMs);
		if (this.profile.failRate && Math.random() < this.profile.failRate) {
			return { stdout: "", stderr: "synthetic failure", exitCode: 1 };
		}
		return { stdout: this.syntheticStdout(command), stderr: "", exitCode: 0 };
	}

	private syntheticStdout(command: string): string {
		if (command === CPU_BENCH_COMMAND || command.includes("awk 'BEGIN{s=0")) {
			// Convert target Mops/s into a plausible NS for the fixed workload.
			const iterations = 20_000_000;
			const seconds = iterations / (jittered(this.profile.cpuMops, this.profile.jitter) * 1e6);
			return `NS=${Math.round(seconds * 1e9)}`;
		}
		if (command === DISK_WRITE_COMMAND || command.includes("of=$HOME/.am-bench.bin")) {
			const mbps = jittered(this.profile.diskWriteMbps, this.profile.jitter);
			return `268435456 bytes (268 MB, 256 MiB) copied, 0.4 s, ${mbps.toFixed(0)} MB/s`;
		}
		if (command === DISK_READ_COMMAND || command.includes("if=$HOME/.am-bench.bin")) {
			const mbps = jittered(this.profile.diskReadMbps, this.profile.jitter);
			return `268435456 bytes (268 MB, 256 MiB) copied, 0.2 s, ${mbps.toFixed(0)} MB/s`;
		}
		return "ok";
	}
}

/** Plausible demo profiles per provider (NOT measurements — demo only). */
export const DEMO_PROFILES: Record<ProviderKind, FakeProfile> = {
	dedalus: {
		provisionMs: 120,
		readyDelayMs: 140,
		execMs: 70,
		wakeMs: 240,
		teardownMs: 180,
		cpuMops: 95,
		diskWriteMbps: 640,
		diskReadMbps: 1800,
		jitter: 0.15,
	},
	e2b: {
		provisionMs: 180,
		readyDelayMs: 160,
		execMs: 95,
		wakeMs: 520,
		teardownMs: 220,
		cpuMops: 88,
		diskWriteMbps: 560,
		diskReadMbps: 1500,
		jitter: 0.15,
	},
	sprites: {
		provisionMs: 260,
		readyDelayMs: 220,
		execMs: 120,
		wakeMs: 410,
		teardownMs: 260,
		cpuMops: 82,
		diskWriteMbps: 480,
		diskReadMbps: 1300,
		jitter: 0.18,
	},
	vercel: {
		provisionMs: 320,
		readyDelayMs: 300,
		execMs: 110,
		wakeMs: 900,
		teardownMs: 240,
		cpuMops: 90,
		diskWriteMbps: 520,
		diskReadMbps: 1400,
		jitter: 0.2,
	},
};
