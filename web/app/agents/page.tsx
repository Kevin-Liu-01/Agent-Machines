import {
	LinkCard,
	MarketingHero,
	MarketingShell,
	MetricGrid,
	ReticleSpacer,
	SectionBand,
	TerminalPanel,
} from "@/components/marketing/MarketingPage";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { AGENT_TEMPLATES } from "@/lib/marketing/public-site";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
	title: "Agent templates",
	description:
		"Inspect configurable agent starting setups: runtime suggestions, role prompts, memory, and selected skills. Make one yours before choosing where to run it.",
	path: "/agents",
	keywords: ["agent templates", "worker templates", "Hermes agent", "OpenClaw agent"],
});

const TEMPLATE_METRICS = [
	{ label: "Starting setups", value: String(AGENT_TEMPLATES.length), detail: "role prompts and selected abilities" },
	{ label: "Runtimes", value: "4", detail: "Hermes, OpenClaw, Claude Code, Codex" },
	{ label: "Compute adapters", value: "4", detail: "capabilities and resource limits differ" },
];

export default function AgentsPage() {
	return (
		<MarketingShell>
			<main id="top">
				<MarketingHero
					kicker="Agents"
					title="Start with a setup. Make it yours."
					description="Choose a role, inspect its instructions, and connect your tools. These are editable starting configurations, not finished applications. Model and compute accounts are required to run one."
					badges={["research", "coding", "browser", "data"]}
					icon="bot"
					actions={
						<>
							<ReticleButton as="a" href="/dashboard/agents?preset=coding-agent" size="lg" className="rounded-[var(--ret-card-radius)]">
								Customize a coding setup
							</ReticleButton>
							<ReticleButton as="a" href="/components" variant="secondary" size="lg" className="rounded-[var(--ret-card-radius)]">
								Explore the components
							</ReticleButton>
						</>
					}
					aside={
						<TerminalPanel
							title="configuration illustration"
							lines={[
								"template → role prompt + selected entries",
								"you choose → runtime + model + compute",
								"you edit → persona + rules + context",
								"you configure → tools + service access",
								"run → Console or native CLI terminal",
							]}
							className="h-full rounded-none border-0"
						/>
					}
				/>
				<ReticleSpacer />
				<SectionBand label="Templates" title="Choose the job.">
					<div className="mb-5">
						<MetricGrid metrics={TEMPLATE_METRICS} />
					</div>
					<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
						{AGENT_TEMPLATES.map((agent) => (
							<LinkCard
								key={agent.slug}
								href={agent.href}
								title={agent.title}
								description={agent.description}
								icon={agent.icon}
							/>
						))}
					</div>
				</SectionBand>
				<ReticleSpacer />
			</main>
		</MarketingShell>
	);
}
