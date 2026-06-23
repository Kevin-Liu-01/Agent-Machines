import type { Metadata } from "next";

import {
	FlowSteps,
	MarketingHero,
	MarketingShell,
	MetricGrid,
	ReticleSpacer,
	SectionBand,
	TerminalPanel,
} from "@/components/marketing/MarketingPage";
import { PricingCalculator } from "@/components/marketing/PricingCalculator";
import { ReticleButton } from "@/components/reticle/ReticleButton";

export const metadata: Metadata = {
	title: "Pricing",
	description:
		"Agent Machines pricing model for provider-backed workers, usage tracking, compute, memory, storage, and model route costs.",
	alternates: { canonical: "/pricing" },
};

const PRICING_METRICS = [
	{ label: "Seat pricing", value: "$0", detail: "workers are the unit" },
	{ label: "Usage tracking", value: "daily", detail: "CPU, memory, storage rollups" },
	{ label: "Model costs", value: "BYOK", detail: "billed by the selected route" },
];

const PRICING_FLOW = [
	{ label: "Choose lane", body: "Pick the provider, runtime, machine spec, and model route." },
	{ label: "Run worker", body: "Active compute, reserved memory, storage, and model calls are tracked." },
	{ label: "Inspect usage", body: "Dashboard usage panels expose rollups without hiding the source." },
];

export default function PricingPage() {
	return (
		<MarketingShell>
			<main id="top">
				<MarketingHero
					kicker="./PRICING"
					title="Pay for the worker you run."
					description="Agent Machines is designed around provider-backed workers, not seats. Bring provider and model credentials, then inspect compute, memory, storage, logs, and model-route usage from the dashboard."
					badges={["BYOK", "usage", "providers", "models"]}
					icon="cpu"
					actions={
						<>
							<ReticleButton as="a" href="/sign-in" size="lg" className="rounded-[var(--ret-card-radius)]">
								Start for free
							</ReticleButton>
							<ReticleButton as="a" href="/docs" variant="secondary" size="lg" className="rounded-[var(--ret-card-radius)]">
								Setup docs
							</ReticleButton>
						</>
					}
					aside={
						<TerminalPanel
							title="usage events"
							lines={[
								"machine active_seconds recorded",
								"cpu_seconds rolled up daily",
								"memory_gib_seconds rolled up daily",
								"storage_gib_month estimated",
								"model route usage tracked separately",
							]}
							className="h-full rounded-none border-0"
						/>
					}
				/>
				<ReticleSpacer />
				<SectionBand label="Rates" title="Compute, memory, and storage stay visible.">
					<PricingCalculator />
				</SectionBand>
				<ReticleSpacer />
				<SectionBand label="Tracking" title="The billable shape matches the dashboard shape.">
					<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
						<MetricGrid metrics={PRICING_METRICS} />
						<TerminalPanel
							title="dashboard surfaces"
							lines={[
								"/dashboard/usage",
								"/api/dashboard/metrics/usage",
								"/api/dashboard/logs",
								"/api/dashboard/machines",
							]}
						/>
					</div>
				</SectionBand>
				<ReticleSpacer />
				<SectionBand label="Flow" title="Nothing magic gets hidden in the price.">
					<FlowSteps steps={PRICING_FLOW} />
				</SectionBand>
				<ReticleSpacer />
			</main>
		</MarketingShell>
	);
}
