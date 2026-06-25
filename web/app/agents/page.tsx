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
	title: "Agents",
	description:
		"Browse Agent Machines worker templates for research, coding, code review, data analysis, browser automation, support, QA, operations, security, and growth.",
	path: "/agents",
	keywords: ["agent templates", "worker templates", "Hermes agent", "OpenClaw agent"],
});

const MARKET_METRICS = [
	{ label: "Templates", value: String(AGENT_TEMPLATES.length), detail: "runtime plus loadout recipes" },
	{ label: "Runtime lanes", value: "4", detail: "Hermes, OpenClaw, Claude Code, Codex" },
	{ label: "Provider lanes", value: "4", detail: "E2B, Sprites, Dedalus, Vercel" },
];

export default function AgentsPage() {
	return (
		<MarketingShell>
			<main id="top">
				<MarketingHero
					kicker="./AGENTS"
					title="Pick the worker by job."
					description="Each template is a practical recipe: runtime, provider lane, model path, loadout, workflow, observability, and the artifacts you should expect back."
					badges={["research", "coding", "browser", "data"]}
					icon="bot"
					actions={
						<>
							<ReticleButton as="a" href="/agents/deep-research" size="lg" className="rounded-[var(--ret-card-radius)]">
								View deep research
							</ReticleButton>
							<ReticleButton as="a" href="/registry" variant="secondary" size="lg" className="rounded-[var(--ret-card-radius)]">
								Browse registry
							</ReticleButton>
						</>
					}
					aside={
						<TerminalPanel
							title="template manifest"
							lines={[
								"runtime selected per job",
								"provider lane selected per account",
								"model path stored server-side",
								"logs and usage tracked per machine",
								"artifacts stay inspectable",
							]}
							className="h-full rounded-none border-0"
						/>
					}
				/>
				<ReticleSpacer />
				<SectionBand label="Marketplace" title="Templates for the work people actually hand agents.">
					<div className="mb-5">
						<MetricGrid metrics={MARKET_METRICS} />
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
