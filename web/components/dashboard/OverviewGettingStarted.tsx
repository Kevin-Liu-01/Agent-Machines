"use client";

import Link from "next/link";
import { Check } from "@/components/ui/icons";
import { useDashboardConfig } from "@/components/dashboard/DashboardConfigProvider";
import { validateAgentCredentials } from "@/lib/agents/credentials";
import { AGENT_LABEL, PROVIDER_KINDS, type PublicUserConfig } from "@/lib/user-config/schema";

/** Saved configuration is evidence of setup, not a credential or live-health test. */
export function gettingStartedSteps(config: PublicUserConfig) {
	const machines = config.machines.filter((machine) => !machine.archived);
	const active = machines.find((machine) => machine.id === config.activeMachineId) ?? machines[0];
	const runtime = active?.agentKind ?? config.draftAgentKind;
	return [
		{ id: "compute", title: "Connect compute", detail: "Save credentials for a supported compute account.", complete: PROVIDER_KINDS.some((kind) => config.providers[kind].configured), href: "/dashboard/settings" },
		{ id: "model", title: `Connect a model for ${AGENT_LABEL[runtime]}`, detail: "Save the model credentials required by this runtime.", complete: validateAgentCredentials(runtime, config).ok, href: "/dashboard/settings" },
		{ id: "workspace", title: "Create a workspace", detail: "Choose a runtime and provider, then confirm the launch.", complete: machines.length > 0, href: machines.length ? "/dashboard/machines" : "#launch-worker" },
		{ id: "runtime", title: "Install the runtime", detail: "Check the installation result, then open the terminal.", complete: machines.some((machine) => machine.bootstrapState.phase === "succeeded"), href: active ? `/dashboard/machines/${encodeURIComponent(active.id)}` : "#launch-worker" },
	];
}

export function OverviewGettingStarted() {
	const config = useDashboardConfig();
	if (!config) return null;
	const steps = gettingStartedSteps(config);
	const completed = steps.filter((step) => step.complete).length;
	if (completed === steps.length) return null;
	return (
		<section aria-labelledby="getting-started-title" className="overflow-hidden rounded-xl border border-[var(--ret-border)] bg-[var(--ret-bg)]">
			<div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-4">
				<div>
					<h2 id="getting-started-title" className="text-lg font-medium text-[var(--ret-text)]">Set up your first workspace</h2>
				</div>
				<span className="text-sm tabular-nums text-[var(--ret-text-dim)]">{completed} of {steps.length} complete</span>
			</div>
			<ol className="grid gap-1 px-2 pb-2 sm:grid-cols-2 xl:grid-cols-4">
				{steps.map((step, index) => (
					<li key={step.id}>
						<Link href={step.href} className="flex h-full items-start gap-2.5 rounded-md px-2 py-3 hover:bg-[var(--ret-surface)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ret-purple)]">
							<span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm ${step.complete ? "border-[var(--ret-green)]/30 text-[var(--ret-green)]" : "border-[var(--ret-border)] text-[var(--ret-text-muted)]"}`} aria-label={step.complete ? "Complete" : "Incomplete"}>{step.complete ? <Check size={16} aria-hidden="true" /> : index + 1}</span>
							<div className="min-w-0 flex-1"><p className="text-[15px] font-medium text-[var(--ret-text)]">{step.title}</p><p className="mt-1 text-sm text-[var(--ret-text-muted)]">{step.detail}</p></div>
						</Link>
					</li>
				))}
			</ol>
			<p className="border-t border-[var(--ret-border)] px-4 py-2 text-xs leading-5 text-[var(--ret-text-muted)]">Based on saved configuration and recorded installation results. Credentials are not connection-tested here.</p>
		</section>
	);
}
