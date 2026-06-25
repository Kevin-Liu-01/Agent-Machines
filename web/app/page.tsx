import { AgentCommandToggle } from "@/components/AgentCommandToggle";
import { CircuitArt } from "@/components/reticle/CircuitArt";
import { ContributionGrid } from "@/components/ContributionGrid";
import { FleetDemo } from "@/components/FleetDemo";
import { RuntimeVizGrid } from "@/components/RuntimeVizGrid";
import { FaqSection } from "@/components/FaqSection";
import { Footer } from "@/components/Footer";
import { GitHubStarLink } from "@/components/GitHubStarLink";
import { HeroBlock } from "@/components/HeroBlock";
import { LoadoutPreview } from "@/components/LoadoutPreview";
import { PublicNavbar } from "@/components/PublicNavbar";
import { ReticleBand } from "@/components/reticle/ReticleBand";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ReticlePageGrid } from "@/components/reticle/ReticlePageGrid";
import { ReticleSection } from "@/components/reticle/ReticleSection";
import { ReticleSpacer } from "@/components/reticle/ReticleSpacer";
import { StatsRow } from "@/components/StatsRow";
import { WorkflowNavigator } from "@/components/WorkflowNavigator";
import { SITE } from "@/lib/seo/config";

export default function HomePage() {
	return (
		<ReticlePageGrid>
			<PublicNavbar
				githubRepo={SITE.githubRepo}
				githubLink={<GitHubStarLink repo={SITE.githubRepo} />}
			/>

			<main id="top">
				<ReticleSection contentClassName="" >
					<HeroBlock />
				</ReticleSection>

				<ReticleSpacer />

				<ReticleSection contentClassName="">
					<FleetDemo />
				</ReticleSection>

				<ReticleSpacer />

				<ReticleSection contentClassName="" background="wing-nyx-waves">
					<ContributionGrid />
				</ReticleSection>

				<ReticleSpacer />

				<ReticleBand contentClassName="">
					<StatsRow />
				</ReticleBand>

				<ReticleSpacer />

				<ReticleSection id="workflow" contentClassName="">
					<WorkflowNavigator />
				</ReticleSection>

				<ReticleSpacer />

				<ReticleSection id="agents" contentClassName="">
					<div className="grid grid-cols-1 border-b border-[var(--ret-border)] md:grid-cols-[1fr_320px]">
						<div className="px-4 py-5 md:px-5">
							<ReticleLabel>AGENTS</ReticleLabel>
							<h2 className="ret-display mt-2 text-xl md:text-2xl">
								Chat and terminal commands for every agent.
							</h2>
							<p className="mt-2 max-w-[80ch] text-[12px] leading-relaxed text-[var(--ret-text-dim)]">
								Pick a runtime and see its command shape, provider routes, docs,
								and execution mode. Hermes stays the default, but the surface is
								shared by OpenClaw, Claude Code, and Codex.
							</p>
						</div>
						<div className="relative hidden min-h-[116px] overflow-hidden border-l border-[var(--ret-border)] md:block">
							<CircuitArt slug="agents" variant="fill" />
							<div className="relative z-10 grid h-full grid-cols-2 gap-px bg-[var(--ret-border)]/70 p-3">
								<div className="bg-[var(--ret-bg)]/90 px-3 py-2 backdrop-blur-sm">
									<div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
										modes
									</div>
									<div className="mt-1 text-[13px] font-semibold text-[var(--ret-text)]">
										2
									</div>
								</div>
								<div className="bg-[var(--ret-bg)]/90 px-3 py-2 backdrop-blur-sm">
									<div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
										routes
									</div>
									<div className="mt-1 text-[13px] font-semibold text-[var(--ret-text)]">
										4
									</div>
								</div>
							</div>
						</div>
					</div>
					<AgentCommandToggle />
				</ReticleSection>

				<ReticleSpacer />

				<ReticleSection id="loadout" contentClassName="">
					<LoadoutPreview />
				</ReticleSection>

				<ReticleSpacer />

				<ReticleBand id="runtime" contentClassName="">
					<RuntimeVizGrid />
				</ReticleBand>

				<ReticleSpacer />

				<ReticleBand id="faq" contentClassName="">
					<FaqSection />
				</ReticleBand>

				<ReticleSpacer />
			</main>

			<Footer />
		</ReticlePageGrid>
	);
}
