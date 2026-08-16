import {
	FlowSteps,
	MarketingHero,
	MarketingShell,
	MetricGrid,
	ReticleSpacer,
	SectionBand,
	TerminalPanel,
} from "@/components/marketing/MarketingPage";
import { WorkerSystemThesis } from "@/components/WorkerSystemThesis";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import type { ResourcePage } from "@/lib/marketing/public-site";

const RESOURCE_METRICS = [
	{ label: "Control plane", value: "public", detail: "human-readable setup path" },
	{ label: "Dashboard", value: "linked", detail: "pages map to real surfaces" },
	{ label: "State", value: "explicit", detail: "logs, usage, artifacts, cron" },
];

const WORKER_SYSTEM_METRICS = [
	{ label: "Product object", value: "Worker", detail: "identity and responsibility persist" },
	{ label: "Machinery", value: "modular", detail: "runtime, model, tools, and sandbox" },
	{ label: "Supervision", value: "evidence", detail: "watch, approve, inspect, and move" },
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
					badges={page.slug === "docs" ? ["durable Worker", "replaceable stack", "supervised work"] : ["setup", "runtime", "provider", "observability"]}
					icon={page.icon}
					actions={
						<>
							<ReticleButton as="a" href="/sign-in" size="lg" className="rounded-[var(--ret-card-radius)]">
								Start for free
							</ReticleButton>
							<ReticleButton as="a" href="/agents/deep-research" variant="secondary" size="lg" className="rounded-[var(--ret-card-radius)]">
								Example agent
							</ReticleButton>
							{page.slug === "docs" ? (
								<ReticleButton
									as="a"
									href="https://github.com/Kevin-Liu-01/Agent-Machines/blob/main/docs/WHITEPAPER.md"
									target="_blank"
									rel="noreferrer"
									variant="ghost"
									size="lg"
									className="rounded-[var(--ret-card-radius)]"
								>
									Read the whitepaper
								</ReticleButton>
							) : null}
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
				{page.slug === "docs" ? (
					<>
						<WorkerSystemThesis />
						<ReticleSpacer />
					</>
				) : null}
				<SectionBand label="Map" title="What this resource covers.">
					<FlowSteps steps={page.sections} />
				</SectionBand>
				<ReticleSpacer />
				<SectionBand label="Ground truth" title="The resource mirrors product surfaces.">
					<MetricGrid metrics={page.slug === "docs" ? WORKER_SYSTEM_METRICS : RESOURCE_METRICS} />
				</SectionBand>
				<ReticleSpacer />
			</main>
		</MarketingShell>
	);
}
