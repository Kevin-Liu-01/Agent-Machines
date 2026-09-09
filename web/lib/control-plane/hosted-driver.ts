import { performance } from "node:perf_hooks";

import { getHarness } from "agent-machines/mux";
import type {
	WorkerObservedState,
	WorkerPlacement,
	WorkerResource,
	WorkerRuntimeDriver,
} from "agent-machines/control-plane";
import type { MuxAgentEvent, UpstreamKeys } from "agent-machines/mux";

import { agentArtifactsPresent } from "@/lib/bootstrap/bootstrap-repair";
import { machineHomeForProvider } from "@/lib/bootstrap/bootstrap-log";
import { runtimeModel } from "@/lib/agents/runtime-model";
import { runWebBootstrap } from "@/lib/bootstrap/runner";
import { boundedConsoleCommand } from "./bounded-console-command";
import { createMachineForConfig } from "@/lib/dashboard/provision";
import { runMachineMigration } from "@/lib/dashboard/migrate";
import { forgetHostedPlacement } from "@/lib/mux/placements";
import {
	assertUsableProvisionState,
	provisionWithFailover,
} from "@/lib/mux/failover";
import { loadTenantHealth } from "@/lib/mux/health";
import { resolveRoute } from "@/lib/mux/route";
import { getProvider } from "@/lib/providers";
import {
	getUserConfigById,
	setOperationalUserConfigById,
	type OperationalConfigPatch,
} from "@/lib/user-config/clerk";
import {
	DEFAULT_MACHINE_SPEC,
	DEFAULT_MEMORY_BUNDLE_ID,
	DEFAULT_MODEL,
	type MachineRef,
	type MachineSpec,
	type ProviderKind,
	type UserConfig,
	type Worker,
} from "@/lib/user-config/schema";

function observed(state: string): WorkerObservedState {
	if (state === "ready" || state === "starting") return "running";
	if (state === "sleeping") return "sleeping";
	if (state === "destroyed" || state === "destroying") return "missing";
	return "unknown";
}

function resources(worker: WorkerResource): MachineSpec {
	return {
		vcpu: worker.spec.resources?.vcpu ?? DEFAULT_MACHINE_SPEC.vcpu,
		memoryMib:
			worker.spec.resources?.memoryMib ?? DEFAULT_MACHINE_SPEC.memoryMib,
		storageGib:
			worker.spec.resources?.diskGib ?? DEFAULT_MACHINE_SPEC.storageGib,
	};
}

function placement(worker: WorkerResource, machine: MachineRef): WorkerPlacement {
	return {
		workerId: worker.id,
		sandboxId: machine.id,
		sandbox: machine.providerKind,
		runtime: machine.agentKind,
	};
}

function workerRecord(worker: WorkerResource, current?: Worker): Worker {
	const now = new Date().toISOString();
	return {
		id: worker.id,
		name: worker.spec.name,
		source: current?.source ?? "custom",
		agentKind: worker.spec.runtime,
		model: worker.spec.model ?? current?.model ?? DEFAULT_MODEL,
		gatewayProfileId:
			worker.spec.gatewayProfileId ?? current?.gatewayProfileId ?? "vercel-ai-gateway",
		memoryBundleId:
			worker.spec.memoryBundleId ??
			current?.memoryBundleId ??
			DEFAULT_MEMORY_BUNDLE_ID,
		rolePrompt: worker.spec.rolePrompt ?? current?.rolePrompt ?? null,
		lastMachineId: current?.lastMachineId ?? null,
		createdAt: current?.createdAt ?? worker.createdAt,
		updatedAt: now,
	};
}

function upstreams(config: UserConfig): UpstreamKeys {
	return {
		anthropic: config.aiProviderKeys.anthropic,
		openai: config.aiProviderKeys.openai,
		openrouter: config.aiProviderKeys.openrouter,
		aiGateway: config.aiProviderKeys.vercelAiGateway,
	};
}

function aggregateEvents(events: MuxAgentEvent[]): string {
	const result = [...events].reverse().find((event) => event.type === "result");
	if (result?.type === "result" && result.text) return result.text;
	return events
		.filter((event): event is Extract<MuxAgentEvent, { type: "text" }> => event.type === "text")
		.map((event) => event.delta)
		.join("");
}

export type HostedRuntimeExecutionOptions = {
	/** Absolute request deadline, not a fresh timeout after lifecycle work. */
	executionDeadlineMs?: number;
};

/**
 * Hosted provider/harness adapter for the public control-plane kernel. It uses
 * stable user-id persistence instead of request-local auth so the same driver
 * works from requests, `after()`, cron ticks and recovery consumers.
 */
export class HostedWorkerRuntimeDriver implements WorkerRuntimeDriver {
	private config: UserConfig | null;

	constructor(
		readonly userId: string,
		initialConfig: UserConfig | null = null,
		private readonly executionOptions: HostedRuntimeExecutionOptions = {},
	) {
		this.config = initialConfig;
	}

	private runTimeoutMs(): number {
		const deadline = this.executionOptions.executionDeadlineMs;
		if (deadline === undefined) return 600_000;
		if (!Number.isFinite(deadline)) throw new Error("Worker run execution deadline is invalid.");
		// Reserve ten seconds for guest termination and twenty for journal/save.
		const remaining = Math.floor(deadline - Date.now() - 30_000);
		if (remaining <= 0) throw new Error("Worker run did not start: its execution deadline has been reached.");
		return Math.min(180_000, remaining);
	}

	private async getConfig(): Promise<UserConfig> {
		if (!this.config) this.config = await getUserConfigById(this.userId);
		return this.config;
	}

	private async setConfig(patch: OperationalConfigPatch): Promise<UserConfig> {
		this.config = await setOperationalUserConfigById(
			this.userId,
			await this.getConfig(),
			patch,
		);
		return this.config;
	}

	private async machineFor(
		placementValue: WorkerPlacement,
	): Promise<{ config: UserConfig; machine: MachineRef }> {
		const config = await this.getConfig();
		const machine = config.machines.find(
			(candidate) => candidate.id === placementValue.sandboxId && !candidate.archived,
		);
		if (!machine) throw new Error(`machine ${placementValue.sandboxId} does not exist`);
		return { config, machine };
	}

	async inspect(placementValue: WorkerPlacement): Promise<WorkerObservedState> {
		try {
			const { config, machine } = await this.machineFor(placementValue);
			return observed(
				(await getProvider(machine.providerKind, config.providers).state(machine.id)).state,
			);
		} catch (error) {
			if (error instanceof Error && /does not exist|not found/i.test(error.message)) {
				return "missing";
			}
			return "unknown";
		}
	}

	async provision(worker: WorkerResource): Promise<WorkerPlacement> {
		let config = await this.getConfig();
		const currentWorker = config.workers.find((entry) => entry.id === worker.id);
		if (currentWorker?.lastMachineId) {
			const existing = config.machines.find(
				(machine) => machine.id === currentWorker.lastMachineId && !machine.archived,
			);
			if (existing) return placement(worker, existing);
		}

		const desiredWorker = workerRecord(worker, currentWorker);
		await this.setConfig({
			workers: [
				...config.workers.filter((entry) => entry.id !== worker.id),
				desiredWorker,
			],
		});
		config = await this.getConfig();
		const resolved =
			worker.spec.sandbox === "auto"
				? resolveRoute(config)
				: resolveRoute(config, {
						primary: worker.spec.sandbox,
						order: worker.spec.sandboxRoute ?? [worker.spec.sandbox],
					});
		const primary =
			worker.spec.sandbox === "auto" ? resolved.route[0] : worker.spec.sandbox;
		if (!primary || resolved.route.length === 0) {
			throw new Error("no sandbox provider is configured for this Worker route");
		}
		const selected = await provisionWithFailover({
			primary,
			route: resolved.route,
			skipped: resolved.skipped,
			health: await loadTenantHealth({ tenantId: this.userId }),
			lane: {
				provision: (providerKind) =>
					createMachineForConfig(
						config,
						{
							providerKind,
							agentKind: worker.spec.runtime,
							spec: resources(worker),
							model: worker.spec.model ?? DEFAULT_MODEL,
							name: `${worker.spec.name}-${worker.id.slice(-6)}`.slice(0, 80),
							gatewayProfileId: worker.spec.gatewayProfileId,
							environmentProfileId: worker.spec.environmentProfileId,
						},
						(patch) => this.setConfig(patch),
					),
				accept: (providerKind, created) =>
					assertUsableProvisionState(providerKind, created.machineId, created.state),
				teardown: async (providerKind, machineId) => {
					await getProvider(providerKind, config.providers).destroy(machineId);
					await this.setConfig({ removeMachine: machineId });
				},
			},
		});
		if (!selected.ok) throw selected.error;
		const created = selected.created;
		const latest = await this.getConfig();
		const machine = latest.machines.find((entry) => entry.id === created.machineId);
		if (!machine) throw new Error(`provisioned machine ${created.machineId} was not persisted`);
		await this.setConfig({
			workers: latest.workers.map((entry) =>
				entry.id === worker.id
					? { ...entry, lastMachineId: machine.id, updatedAt: new Date().toISOString() }
					: entry,
			),
		});
		return placement(worker, machine);
	}

	async bootstrap(
		placementValue: WorkerPlacement,
		worker: WorkerResource,
	): Promise<WorkerPlacement> {
		let { config, machine } = await this.machineFor(placementValue);
		const provider = getProvider(machine.providerKind, config.providers);
		const desiredModel = worker.spec.model ?? machine.model;
		const desiredGatewayProfile =
			worker.spec.gatewayProfileId ?? machine.gatewayProfileId;
		const desiredEnvironmentProfile =
			worker.spec.environmentProfileId ?? machine.environmentProfileId;
		const configurationChanged =
			machine.agentKind !== worker.spec.runtime ||
			machine.model !== desiredModel ||
			machine.gatewayProfileId !== desiredGatewayProfile ||
			machine.environmentProfileId !== desiredEnvironmentProfile;
		if (
			!configurationChanged &&
			machine.bootstrapState.phase === "succeeded" &&
			(await agentArtifactsPresent(machine, provider))
		) {
			return placement(worker, machine);
		}
		if (this.executionOptions.executionDeadlineMs !== undefined) {
			throw new Error("Prepare the Worker through its lifecycle controls before starting a Console run. Its runtime configuration needs bootstrap.");
		}
		// Bootstrap against the desired runtime in memory. Persisting agentKind
		// before its install/probe succeeds would make the dashboard lie about
		// what is actually on the sandbox.
		const bootstrapMachine = {
			...machine,
			agentKind: worker.spec.runtime,
			model: desiredModel,
			gatewayProfileId: desiredGatewayProfile,
			environmentProfileId: desiredEnvironmentProfile,
		};
		const result = await runWebBootstrap({
			machine: bootstrapMachine,
			provider,
			config,
			force: configurationChanged,
			onState: async (bootstrapState) => {
				await this.setConfig({
					patchMachine: { id: machine.id, patch: { bootstrapState } },
				});
			},
		});
		await this.setConfig({
			patchMachine: {
				id: machine.id,
				patch: {
					agentKind: worker.spec.runtime,
					model: worker.spec.model ?? machine.model,
					gatewayProfileId:
						worker.spec.gatewayProfileId ?? machine.gatewayProfileId,
					environmentProfileId:
						worker.spec.environmentProfileId ?? machine.environmentProfileId,
					apiUrl: result.apiUrl,
					apiKey: result.apiKey,
				},
			},
		});
		const latest = await this.getConfig();
		const currentWorker = latest.workers.find((entry) => entry.id === worker.id);
		await this.setConfig({
			workers: [
				...latest.workers.filter((entry) => entry.id !== worker.id),
				workerRecord(worker, currentWorker),
			],
		});
		return { ...placementValue, runtime: worker.spec.runtime };
	}

	async wake(placementValue: WorkerPlacement): Promise<void> {
		const { config, machine } = await this.machineFor(placementValue);
		await getProvider(machine.providerKind, config.providers).wake(machine.id);
	}

	async sleep(placementValue: WorkerPlacement): Promise<void> {
		const { config, machine } = await this.machineFor(placementValue);
		await getProvider(machine.providerKind, config.providers).sleep(machine.id);
	}

	async migrate(
		placementValue: WorkerPlacement,
		to: ProviderKind,
		worker: WorkerResource,
	): Promise<WorkerPlacement> {
		const state = await runMachineMigration({
			machineId: placementValue.sandboxId,
			to,
			moveState: worker.spec.migrationOptions?.moveState ?? true,
			mode: worker.spec.migrationPolicy ?? "live",
			source: worker.spec.migrationOptions?.source ?? "destroy",
			userId: this.userId,
			configStore: {
				get: () => this.getConfig(),
				set: (patch) => this.setConfig(patch),
			},
		});
		if (state.phase !== "succeeded" || !state.report) {
			throw new Error(state.lastError ?? `migration to ${to} failed`);
		}
		return {
			workerId: worker.id,
			sandboxId: state.report.newMachineId,
			sandbox: to,
			runtime: worker.spec.runtime,
		};
	}

	async destroy(
		placementValue: WorkerPlacement,
		worker: WorkerResource,
	): Promise<void> {
		const config = await this.getConfig();
		const machine = config.machines.find(
			(candidate) => candidate.id === placementValue.sandboxId,
		);
		if (machine) {
			await getProvider(machine.providerKind, config.providers).destroy(machine.id);
			await forgetHostedPlacement({ userId: this.userId, machine });
			await this.setConfig({ removeMachine: machine.id });
		}
		const latest = await this.getConfig();
		await this.setConfig({
			workers: latest.workers.map((entry) =>
				entry.id === worker.id
					? { ...entry, lastMachineId: null, updatedAt: new Date().toISOString() }
					: entry,
			),
		});
	}

	async run(
		placementValue: WorkerPlacement,
		prompt: string,
		options: {
			runKey: string;
			model?: string;
			scheduleId?: string;
			scheduledFor?: string;
		},
	): Promise<unknown> {
		const { config, machine } = await this.machineFor(placementValue);
		const provider = getProvider(machine.providerKind, config.providers);
		const harness = getHarness(machine.agentKind);
		const configuredRuntime = machine.agentKind === "hermes" || machine.agentKind === "openclaw";
		const command = harness.runCommand(prompt, machine.agentKind === "hermes" ? {} : upstreams(config), {
			// OpenClaw's configured primary already incorporates the gateway
			// provider. Passing the logical Worker model here can be a different
			// ref (for example anthropic/... vs router/anthropic/...), which current
			// OpenClaw correctly rejects as an unallowlisted per-run override.
			model:
				configuredRuntime
					? undefined
					: runtimeModel(machine.agentKind, options.model),
		});
		const home = machineHomeForProvider(machine.providerKind);
		const hostedPath = [
			`${home}/.agent-machines/venv/bin`,
			`${home}/.npm-global/bin`,
			`${home}/.local/bin`,
			`${home}/.agent-machines/node/bin`,
			`${home}/.agent-machines/pkgs/node_modules/.bin`,
		].join(":");
		// Hosted Hermes keeps its provider, credentials, model and memory in this
		// durable home. A generic SDK provider override would ignore that setup.
		const runtimeSetup = machine.agentKind === "hermes"
			? `if [ -f "${home}/.agent-machines/.agent-env" ]; then . "${home}/.agent-machines/.agent-env" || exit $?; fi; export HERMES_HOME="${home}/.agent-machines"; `
			: "";
		const startedAt = new Date().toISOString();
		const started = performance.now();
		const timeoutMs = this.runTimeoutMs();
		const isBounded = this.executionOptions.executionDeadlineMs !== undefined;
		const runCommand = `${runtimeSetup}export PATH="${hostedPath}:$PATH"; ${command.command}`;
		const result = await provider.exec(
			machine.id,
			isBounded ? boundedConsoleCommand(runCommand, timeoutMs) : runCommand,
			{
			timeoutMs: timeoutMs + (isBounded ? 10_000 : 0),
			env: command.env,
			},
		);
		const parser = harness.newTurnParser?.() ?? harness.parseLine.bind(harness);
		const events = result.stdout
			.split(/\r?\n/)
			.flatMap((line) => (line.trim() ? parser(line) : []));
		if (options.scheduleId) {
			const record = Buffer.from(
				JSON.stringify({
					id: options.scheduleId,
					startedAt,
					finishedAt: new Date().toISOString(),
					exitCode: result.exitCode,
					arm: {
						runtime: machine.agentKind,
						substrate: machine.providerKind,
						model: machine.model,
						router: machine.gatewayProfileId ?? null,
					},
				}),
				"utf8",
			).toString("base64");
			const recorded = await provider.exec(
				machine.id,
				`mkdir -p "$HOME/.agent-machines/cron" && printf %s '${record}' | base64 -d >> "$HOME/.agent-machines/cron/runs.jsonl" && printf '\\n' >> "$HOME/.agent-machines/cron/runs.jsonl"`,
				{ timeoutMs: 15_000 },
			);
			if (recorded.exitCode !== 0) {
				throw new Error(
					`cron run completed but its durable run log failed with exit ${recorded.exitCode}`,
				);
			}
		}
		if (result.exitCode !== 0) {
			throw new Error(
				`${machine.agentKind} run failed with exit ${result.exitCode}: ${(result.stderr || result.stdout).slice(-800)}`,
			);
		}
		return {
			runKey: options.runKey,
			text: aggregateEvents(events),
			events,
			exitCode: result.exitCode,
			durationMs: Math.round(performance.now() - started),
		};
	}
}
