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
import { ReticleButton } from "@/components/reticle/ReticleButton";
import {
	AGENT_TEMPLATES,
	agentTemplateBySlug,
} from "@/lib/marketing/public-site";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { listPresets } from "@/lib/dashboard/presets";
import { presetDestination } from "@/lib/onboarding/preset-selection";

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
	return buildPageMetadata({
		title: agent.title,
		description: agent.description,
		path: agent.href,
		keywords: [agent.runtime, agent.category, agent.providerLane, agent.modelPath],
	});
}

export default async function AgentTemplatePage({ params }: Params) {
	const { slug } = await params;
	const agent = agentTemplateBySlug(slug);
	if (!agent) notFound();

	return (
		<MarketingShell>
			<main id="top">
				<MarketingHero
					kicker={agent.category}
					title={agent.title}
					description={agent.longDescription}
					badges={[agent.runtime, agent.category, "editable setup", "BYOK"]}
					icon={agent.icon}
					actions={
						<>
							<ReticleButton as="a" href={presetDestination("/dashboard/agents", listPresets(), agent.slug)} size="lg" className="rounded-[var(--ret-card-radius)]">
								Customize this setup
							</ReticleButton>
							<ReticleButton as="a" href="/agents" variant="secondary" size="lg" className="rounded-[var(--ret-card-radius)]">
								All templates
							</ReticleButton>
						</>
					}
					aside={
						<TerminalPanel
							title="starting configuration illustration"
							lines={[
								`suggested runtime: ${agent.runtime}`,
								`compute: ${agent.providerLane}`,
								`model setup: ${agent.modelPath}`,
								...agent.loadout.map((item) => `selected entry: ${item}`),
							]}
							className="h-full rounded-none border-0"
						/>
					}
				/>
				<ReticleSpacer />
				<SectionBand label="Template" title="Review the starting setup.">
					<p className="mb-5 max-w-3xl text-sm leading-relaxed text-[var(--ret-text-dim)]">
						Selected entries are not verified tools. Installation, credentials, runtime support, and permissions require setup. Provider choices are not a guarantee that every workload fits every machine.
					</p>
					<div className="space-y-5">
						<MetricGrid metrics={agent.metrics} />
						<div className="overflow-hidden rounded-lg border border-[var(--ret-border)]/45 bg-[var(--ret-bg)]">
							<div className="px-5 pt-5">
								<p className="text-sm font-medium text-[var(--ret-text-dim)]">
									Selected skill and MCP entries
								</p>
							</div>
							<div className="flex flex-wrap gap-2 border-b border-[var(--ret-border)]/35 p-5">
								{agent.loadout.map((item) => (
									<a key={item} href={`/dashboard/registry?q=${encodeURIComponent(item)}`} className="inline-flex min-h-11 items-center rounded-md border border-[var(--ret-border)]/50 px-3 text-sm text-[var(--ret-text)] hover:bg-[var(--ret-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)]" aria-label={`Review ${item} in Registry`}>
										{item}
									</a>
								))}
							</div>
							<div className="text-sm leading-6 text-[var(--ret-text-dim)]">
								<div className="grid grid-cols-[128px_minmax(0,1fr)] border-b border-[var(--ret-border)] last:border-b-0">
									<span className="border-r border-[var(--ret-border)] px-4 py-3 uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
										Runtime
									</span>
									<span className="min-w-0 break-words px-4 py-3 text-[var(--ret-text)]">{agent.runtime}</span>
								</div>
								<div className="grid grid-cols-[128px_minmax(0,1fr)] border-b border-[var(--ret-border)] last:border-b-0">
									<span className="border-r border-[var(--ret-border)] px-4 py-3 uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
										Model
									</span>
									<span className="min-w-0 break-words px-4 py-3 text-[var(--ret-text)]">{agent.modelPath}</span>
								</div>
								<div className="grid grid-cols-[128px_minmax(0,1fr)] border-b border-[var(--ret-border)] last:border-b-0">
									<span className="border-r border-[var(--ret-border)] px-4 py-3 uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
										Provider
									</span>
									<span className="min-w-0 break-words px-4 py-3 text-[var(--ret-text)]">{agent.providerLane}</span>
								</div>
							</div>
						</div>
					</div>
				</SectionBand>
				<ReticleSpacer />
				<SectionBand label="Example task" title="Adapt the workflow.">
					<FlowSteps steps={agent.workflow} />
					<div className="mt-5 flex flex-wrap gap-3">
						<ReticleButton as="a" href="/dashboard/memory" variant="secondary">Edit memory</ReticleButton>
						<ReticleButton as="a" href="/dashboard/registry" variant="secondary">Configure tools</ReticleButton>
						<ReticleButton as="a" href="https://github.com/Kevin-Liu-01/Agent-Machines/blob/main/web/data/presets.json" variant="ghost" target="_blank" rel="noreferrer">View preset source</ReticleButton>
					</div>
				</SectionBand>
				<ReticleSpacer />
			</main>
		</MarketingShell>
	);
}
