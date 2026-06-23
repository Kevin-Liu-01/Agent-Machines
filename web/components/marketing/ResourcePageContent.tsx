import {
	FlowSteps,
	MarketingHero,
	MarketingShell,
	MetricGrid,
	ReticleSpacer,
	SectionBand,
	TerminalPanel,
} from "@/components/marketing/MarketingPage";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import type { ResourcePage } from "@/lib/marketing/public-site";

const RESOURCE_METRICS = [
	{ label: "Control plane", value: "public", detail: "human-readable setup path" },
	{ label: "Dashboard", value: "linked", detail: "routes map to real surfaces" },
	{ label: "State", value: "explicit", detail: "logs, usage, artifacts, cron" },
];

type Props = {
	page: ResourcePage;
	terminalLines: ReadonlyArray<string>;
};

export function ResourcePageContent({ page, terminalLines }: Props) {
	return (
		<MarketingShell>
			<main id="top">
				<MarketingHero
					kicker={`./${page.eyebrow.toUpperCase()}`}
					title={page.title}
					description={page.description}
					badges={["setup", "runtime", "provider", "observability"]}
					icon={page.icon}
					actions={
						<>
							<ReticleButton as="a" href="/sign-in" size="lg" className="rounded-[var(--ret-card-radius)]">
								Start for free
							</ReticleButton>
							<ReticleButton as="a" href="/agents/deep-research" variant="secondary" size="lg" className="rounded-[var(--ret-card-radius)]">
								Example agent
							</ReticleButton>
						</>
					}
					aside={
						<TerminalPanel
							title={`${page.slug} map`}
							lines={terminalLines}
							className="h-full rounded-none border-0"
						/>
					}
				/>
				<ReticleSpacer />
				<SectionBand label="Map" title="What this resource covers.">
					<FlowSteps steps={page.sections} />
				</SectionBand>
				<ReticleSpacer />
				<SectionBand label="Ground truth" title="The resource mirrors product surfaces.">
					<MetricGrid metrics={RESOURCE_METRICS} />
				</SectionBand>
				<ReticleSpacer />
			</main>
		</MarketingShell>
	);
}
