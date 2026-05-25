/**
 * Fire-and-forget web bootstrap — used after wake when artifacts are missing.
 */

import { runWebBootstrap } from "@/lib/bootstrap/runner";
import type { MachineProvider } from "@/lib/providers";
import { setUserConfig } from "@/lib/user-config/clerk";
import type { MachineRef, UserConfig } from "@/lib/user-config/schema";

export function scheduleWebBootstrap(
	machine: MachineRef,
	provider: MachineProvider,
	config: UserConfig,
): void {
	void (async () => {
		await setUserConfig({
			patchMachine: {
				id: machine.id,
				patch: {
					bootstrapState: {
						...machine.bootstrapState,
						phase: "running",
						current: null,
						finishedAt: null,
						lastError: null,
						startedAt: machine.bootstrapState.startedAt ?? new Date().toISOString(),
					},
				},
			},
		}).catch(() => {});

		try {
			const result = await runWebBootstrap({
				machine,
				provider,
				config,
				onState: async (bootstrapState) => {
					await setUserConfig({
						patchMachine: { id: machine.id, patch: { bootstrapState } },
					});
				},
			});
			await setUserConfig({
				patchMachine: {
					id: machine.id,
					patch: { apiUrl: result.apiUrl, apiKey: result.apiKey },
				},
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : "bootstrap failed";
			await setUserConfig({
				patchMachine: {
					id: machine.id,
					patch: {
						bootstrapState: {
							...machine.bootstrapState,
							phase: "failed",
							current: null,
							finishedAt: new Date().toISOString(),
							lastError: message,
						},
					},
				},
			}).catch(() => {});
			console.warn(`[bootstrap] background bootstrap failed for ${machine.id}:`, message);
		}
	})();
}
