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
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
	title: "Pricing",
	description:
		"Agent Machines pricing model for provider-backed workers, usage tracking, compute, memory, storage, and model path costs.",
	path: "/pricing",
	keywords: ["agent pricing", "worker usage tracking", "AI agent cost"],
});

const PRICING_METRICS = [
	{ label: "Provider costs", value: "BYOK", detail: "billed by your compute provider" },
	{ label: "Usage tracking", value: "Recorded", detail: "available where metrics storage is configured" },
	{ label: "Model costs", value: "Separate", detail: "billed by your selected model service" },
];

const PRICING_FLOW = [
	{ label: "Choose lane", body: "Pick the provider, runtime, machine spec, and model path." },
	{ label: "Run worker", body: "Your providers bill for compute, memory, storage, and model calls under their own terms." },
	{ label: "Inspect usage", body: "Review available dashboard measurements and verify actual charges in your provider accounts." },
];

export default function PricingPage() {
	return (
		<MarketingShell>
			<main id="top">
				<MarketingHero
					kicker="Pricing"
					title="Your accounts. Your provider costs."
					description="Bring model and compute credentials. Your providers bill you directly; Agent Machines does not offer a unified bill. Use the estimate below to understand the cost components, not as a quote."
					badges={["BYOK", "usage", "providers", "models"]}
					icon="cpu"
					actions={
						<>
							<ReticleButton as="a" href="/sign-in" size="lg" className="rounded-[var(--ret-card-radius)]">
								Connect your accounts
							</ReticleButton>
							<ReticleButton as="a" href="/docs" variant="secondary" size="lg" className="rounded-[var(--ret-card-radius)]">
								Setup docs
							</ReticleButton>
						</>
					}
					aside={
						<TerminalPanel
							title="Illustrative usage records"
							lines={[
								"machine active_seconds recorded",
								"cpu_seconds rolled up daily",
								"memory_gib_seconds rolled up daily",
								"storage_gib_month estimated",
								"model path usage tracked separately",
							]}
							className="h-full rounded-none border-0"
						/>
					}
				/>
				<ReticleSpacer />
				<SectionBand label="Illustrative rates" title="Estimate a run.">
					<PricingCalculator />
				</SectionBand>
				<ReticleSpacer />
				<SectionBand label="Tracking" title="Inspect usage. Verify your bill.">
					<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
						<MetricGrid metrics={PRICING_METRICS} />
						<nav aria-label="Inspect costs and configuration" className="grid content-start gap-3">
							<ReticleButton as="a" href="/dashboard/usage" variant="secondary">Review usage</ReticleButton>
							<ReticleButton as="a" href="/dashboard/benchmarks" variant="secondary">Compare provider references</ReticleButton>
							<ReticleButton as="a" href="/dashboard/setup" variant="secondary">Configure a Worker</ReticleButton>
						</nav>
					</div>
				</SectionBand>
				<ReticleSpacer />
				<SectionBand label="Before you run" title="Know what can incur a charge.">
					<FlowSteps steps={PRICING_FLOW} />
				</SectionBand>
				<ReticleSpacer />
			</main>
		</MarketingShell>
	);
}
