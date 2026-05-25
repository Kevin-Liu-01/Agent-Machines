/**
 * Provider abstraction for the multi-tenant rig.
 *
 * Each provider (Dedalus, E2B, Sprites) implements a thin
 * `MachineProvider` contract. Routes call `getProvider(kind, creds)` to
 * get an instance bound to the user's credentials, then drive it with
 * `provision`, `wake`, `sleep`, `destroy`, `state`, and `exec`.
 *
 * The interface is read/write but the dashboard mostly uses `state` +
 * `exec` -- the wizard alone is responsible for `provision`. Each
 * implementation is stateless; credentials are passed in per call.
 */

import type {
	MachineSpec,
	ProviderKind,
} from "@/lib/user-config/schema";

/**
 * Normalized state across providers. Maps Dedalus phases, Sprites states,
 * and Sandbox states into one enum the UI can render uniformly.
 */
export type MachineState =
	| "ready"
	| "starting"
	| "sleeping"
	| "destroying"
	| "destroyed"
	| "error"
	| "unknown";

export type ProviderMachineSummary = {
	id: string;
	state: MachineState;
	rawPhase: string;
	spec: MachineSpec;
	createdAt: string | null;
	lastError: string | null;
};

export type RuntimeKind = "persistent-machine" | "ephemeral-session";

export type ProviderCapabilities = {
	runtime: RuntimeKind;
	canProvision: boolean;
	canWake: boolean;
	canSleep: boolean;
	canDestroy: boolean;
	canExec: boolean;
	hasPersistentDisk: boolean;
	usesExternalStorage: boolean;
};

export type ProvisionResult = {
	id: string;
	state: MachineState;
	rawPhase: string;
};

export type ExecResult = {
	stdout: string;
	stderr: string;
	exitCode: number;
};

export type ExecOptions = {
	timeoutMs?: number;
};

export type ProviderError =
	| "missing_credentials"
	| "not_supported"
	| "rate_limited"
	| "transient"
	| "fatal";

export class MachineProviderError extends Error {
	readonly kind: ProviderError;
	readonly providerKind: ProviderKind;
	constructor(
		providerKind: ProviderKind,
		kind: ProviderError,
		message: string,
	) {
		super(message);
		this.name = "MachineProviderError";
		this.providerKind = providerKind;
		this.kind = kind;
	}
}

export type ProvisionInput = {
	spec: MachineSpec;
	name?: string;
	agentKind?: string;
	model?: string;
	env?: Record<string, string>;
};

export type MachineProvider = {
	readonly kind: ProviderKind;
	readonly hasCredentials: boolean;
	readonly capabilities: ProviderCapabilities;

	provision(input: ProvisionInput): Promise<ProvisionResult>;
	state(machineId: string): Promise<ProviderMachineSummary>;
	wake(machineId: string): Promise<ProviderMachineSummary>;
	sleep(machineId: string): Promise<ProviderMachineSummary>;
	destroy(machineId: string): Promise<void>;
	exec(machineId: string, command: string, options?: ExecOptions): Promise<ExecResult>;
	execBackground?(machineId: string, command: string): Promise<void>;
	/** Public HTTPS URL for a listening port (E2B, Sprites). */
	getPublicUrl?(machineId: string, port: number): Promise<string | null>;
};
