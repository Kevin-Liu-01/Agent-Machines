/**
 * Fire-and-forget web bootstrap — used after wake when artifacts are missing,
 * after provisioning, and (with force) by the agent-switch route.
 *
 * Optionally mirrors the machine's mux placement once the install lands; see
 * `placementTenantId` below for why that is opt-in and why it happens here
 * rather than in the route that returns 202.
 */

import { runWebBootstrap } from "@/lib/bootstrap/runner";
import { recordHostedPlacement } from "@/lib/mux/placements";
import type { MachineProvider } from "@/lib/providers";
import { setUserConfig } from "@/lib/user-config/clerk";
import type { MachineRef, UserConfig } from "@/lib/user-config/schema";

export type ScheduleBootstrapOptions = {
	force?: boolean;
	/**
	 * Tenant id to mirror this machine's mux placement under, AFTER the
	 * bootstrap succeeds. Opt-in per call site rather than always-on, and the
	 * timing is the reason: the SDK's own `Mux.create()` remembers a placement
	 * only after `ensureInstalled()` returns, so a placement never claims a
	 * harness that was not installed. The agent-switch route passes it (the
	 * placement's `agent` is the thing that verb changes); provisioning and
	 * wake-repair do not, so they behave byte-identically to before.
	 *
	 * Must be the request's `getEffectiveUserId()`, never a process global.
	 */
	placementTenantId?: string;
};

export function scheduleWebBootstrap(
	machine: MachineRef,
	provider: MachineProvider,
	config: UserConfig,
	options: ScheduleBootstrapOptions = {},
): Promise<void> {
	return (async () => {
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
				force: options.force === true,
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
			// The install landed, so the mux may now be told which harness answers
			// on this sandbox. Best-effort and LAST: this is bookkeeping for a
			// second plane, and a placement-store hiccup must not mark a bootstrap
			// that actually succeeded as failed. A skip is logged with its reason
			// (an ambiguous name, a store error) rather than swallowed.
			if (options.placementTenantId) {
				// `.catch` and not just the function's own no-throw contract: the
				// outer catch below writes bootstrapState "failed", so a throw
				// escaping here would report a SUCCESSFUL bootstrap as failed.
				const mirror = await recordHostedPlacement({
					userId: options.placementTenantId,
					config,
					machine,
				}).catch((mirrorErr: unknown) => ({
					recorded: false as const,
					reason: mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr),
				}));
				if (!mirror.recorded) {
					console.warn(
						`[bootstrap] mux placement not recorded for ${machine.id}: ${mirror.reason}`,
					);
				}
			}
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
