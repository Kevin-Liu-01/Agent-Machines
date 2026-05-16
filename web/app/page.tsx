import { AgentCommandToggle } from "@/components/AgentCommandToggle";
import { ContributionGrid } from "@/components/ContributionGrid";
import { FleetDemo } from "@/components/FleetDemo";
import { RuntimeVizGrid } from "@/components/RuntimeVizGrid";
import { FaqSection } from "@/components/FaqSection";
import { Footer } from "@/components/Footer";
import { HeroBlock } from "@/components/HeroBlock";
import { LoadoutPreview } from "@/components/LoadoutPreview";
import { PublicNavbar } from "@/components/PublicNavbar";
import { ReticleBand } from "@/components/reticle/ReticleBand";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ReticlePageGrid } from "@/components/reticle/ReticlePageGrid";
import { ReticleSection } from "@/components/reticle/ReticleSection";
import { ReticleSpacer } from "@/components/reticle/ReticleSpacer";
import { StatsRow } from "@/components/StatsRow";
import { StickyRuntimeStory } from "@/components/StickyRuntimeStory";
import { WorkflowNavigator } from "@/components/WorkflowNavigator";

export default function HomePage() {
	return (
		<ReticlePageGrid>
			<PublicNavbar githubRepo="Kevin-Liu-01/agent-machines" />

			<main id="top">
				<ReticleSection contentClassName="" background="wing-nyx-waves">
					<HeroBlock />
				</ReticleSection>

				<ReticleSpacer />

				<ReticleSection contentClassName="" background="wing-cloud">
					<FleetDemo />
				</ReticleSection>

				<ReticleSpacer />

				<ReticleSection contentClassName="" background="wing-nyx-waves">
					<ContributionGrid />
				</ReticleSection>

				<ReticleSpacer hatch />

				<ReticleBand contentClassName="">
					<StatsRow />
				</ReticleBand>

				<ReticleSpacer />

				<ReticleSection id="workflow" contentClassName="">
					<WorkflowNavigator />
				</ReticleSection>

				<ReticleSpacer />

				<ReticleSection id="agents" contentClassName="">
					<div className="grid grid-cols-[1fr_auto] border-b border-[var(--ret-border)]">
						<div className="px-4 py-4 md:px-5">
							<ReticleLabel>AGENTS</ReticleLabel>
							<h2 className="ret-display mt-2 text-xl md:text-2xl">
								Chat and terminal commands for every agent.
							</h2>
							<p className="mt-2 max-w-[72ch] text-[12px] text-[var(--ret-text-dim)]">
								Autonomous agents have built-in drivers that wake up on schedule.
								Task-driven CLIs run per-task but can be automated via headless
								flags and cron.
							</p>
						</div>
						<div className="w-20 border-l border-[var(--ret-border)] bg-[repeating-linear-gradient(135deg,var(--ret-rail)_0_1px,transparent_1px_5px)] md:w-40" />
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

				<section id="scroll-story" className="relative">
					<div className="relative z-10 mx-auto w-full bg-[var(--ret-bg)]">
						<StickyRuntimeStory />
					</div>
				</section>

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
