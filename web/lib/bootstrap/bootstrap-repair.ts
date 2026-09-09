/** Detect missing runtime artifacts after sleep/wake and repair gateway. */
import type { MachineProvider } from "@/lib/providers";
import type { MachineRef } from "@/lib/user-config/schema";
import { finalizeGatewayBootstrap } from "./runner";
import { agentArtifactsPresent } from "./runtime-readiness";
export { agentArtifactsPresent } from "./runtime-readiness";

/** True when gateway/CLI files are absent but the machine should already be bootstrapped. */
export async function needsBootstrapRepair(
	machine: MachineRef,
	provider: MachineProvider,
): Promise<boolean> {
	const shouldHaveAgent =
		machine.bootstrapState.phase === "succeeded" ||
		Boolean(machine.apiUrl) ||
		machine.bootstrapState.completed.length > 0;
	if (!shouldHaveAgent) return false;
	return !(await agentArtifactsPresent(machine, provider));
}

/**
 * After wake, restart gateway or finalize URL when the agent is installed.
 * Returns whether full bootstrap is required (artifacts missing).
 */
export async function repairGatewayAfterWake(
	machine: MachineRef,
	provider: MachineProvider,
	config: import("@/lib/user-config/schema").UserConfig,
): Promise<{ repaired: boolean; missingArtifacts: boolean; apiUrl?: string | null }> {
	if (machine.agentKind === "claude-code" || machine.agentKind === "codex") {
		const present = await agentArtifactsPresent(machine, provider);
		return { repaired: false, missingArtifacts: !present, apiUrl: null };
	}

	const present = await agentArtifactsPresent(machine, provider);
	if (!present) {
		return { repaired: false, missingArtifacts: true, apiUrl: null };
	}

	const result = await finalizeGatewayBootstrap({
		machine,
		provider,
		config,
		onState: async () => {},
	});
	return { repaired: true, missingArtifacts: false, apiUrl: result.apiUrl };
}
