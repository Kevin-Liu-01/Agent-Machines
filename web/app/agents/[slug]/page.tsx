import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
	FlowSteps,
	MarketingHero,
	MarketingShell,
	MetricGrid,
	ReticleSpacer,
	SectionBand,
	TerminalPanel,
} from "@/components/marketing/MarketingPage";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import {
	AGENT_TEMPLATES,
	agentTemplateBySlug,
} from "@/lib/marketing/public-site";

type Params = {
	params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
	return AGENT_TEMPLATES.map((agent) => ({ slug: agent.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
	const { slug } = await params;
	const agent = agentTemplateBySlug(slug);
	if (!agent) return {};
	return {
		title: agent.title,
		description: agent.description,
		alternates: { canonical: agent.href },
	};
}

export default async function AgentTemplatePage({ params }: Params) {
	const { slug } = await params;
	const agent = agentTemplateBySlug(slug);
	if (!agent) notFound();

	return (
		<MarketingShell>
			<main id="top">
				<MarketingHero
					kicker={`./${agent.category.toUpperCase()}`}
					title={agent.title}
					description={agent.longDescription}
					badges={[agent.runtime, agent.category, "logs", "artifacts"]}
					icon={agent.icon}
					actions={
						<>
							<ReticleButton as="a" href="/sign-in" size="lg" className="rounded-[var(--ret-card-radius)]">
								Start for free
							</ReticleButton>
							<ReticleButton as="a" href="/agents" variant="secondary" size="lg" className="rounded-[var(--ret-card-radius)]">
								All agents
							</ReticleButton>
						</>
					}
					aside={
						<TerminalPanel
							title="agent loadout"
							lines={[
								`runtime: ${agent.runtime}`,
								`provider: ${agent.providerLane}`,
								`model: ${agent.modelPath}`,
								...agent.loadout.map((item) => `tool: ${item}`),
							]}
							className="h-full rounded-none border-0"
						/>
					}
				/>
				<ReticleSpacer />
				<SectionBand label="Template" title="Runtime, model path, and tools stay explicit.">
					<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
						<MetricGrid metrics={agent.metrics} />
						<div className="border border-[var(--ret-border)] bg-[var(--ret-bg)]">
							<div className="border-b border-[var(--ret-border)] px-4 py-3">
								<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
									Loadout
								</p>
							</div>
							<div className="flex flex-wrap gap-2 border-b border-[var(--ret-border)] p-4">
								{agent.loadout.map((item) => (
									<ReticleBadge key={item} variant="default">
										{item}
									</ReticleBadge>
								))}
							</div>
							<div className="font-mono text-[11px] text-[var(--ret-text-dim)]">
								<div className="grid grid-cols-[128px_minmax(0,1fr)] border-b border-[var(--ret-border)] last:border-b-0">
									<span className="border-r border-[var(--ret-border)] px-4 py-3 uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
										Runtime
									</span>
									<span className="truncate px-4 py-3 text-[var(--ret-text)]">{agent.runtime}</span>
								</div>
								<div className="grid grid-cols-[128px_minmax(0,1fr)] border-b border-[var(--ret-border)] last:border-b-0">
									<span className="border-r border-[var(--ret-border)] px-4 py-3 uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
										Model
									</span>
									<span className="truncate px-4 py-3 text-[var(--ret-text)]">{agent.modelPath}</span>
								</div>
								<div className="grid grid-cols-[128px_minmax(0,1fr)] border-b border-[var(--ret-border)] last:border-b-0">
									<span className="border-r border-[var(--ret-border)] px-4 py-3 uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
										Provider
									</span>
									<span className="truncate px-4 py-3 text-[var(--ret-text)]">{agent.providerLane}</span>
								</div>
							</div>
						</div>
					</div>
				</SectionBand>
				<ReticleSpacer />
				<SectionBand label="Workflow" title="The agent page shows what happens next.">
					<FlowSteps steps={agent.workflow} />
				</SectionBand>
				<ReticleSpacer />
			</main>
		</MarketingShell>
	);
}
