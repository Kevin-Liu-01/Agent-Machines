import { AgentCommandToggle } from "@/components/AgentCommandToggle";
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
import { StatsRow } from "@/components/StatsRow";
import { StickyRuntimeStory } from "@/components/StickyRuntimeStory";
import { WorkflowNavigator } from "@/components/WorkflowNavigator";

export default function HomePage() {
	return (
		<ReticlePageGrid>
			<PublicNavbar githubRepo="Kevin-Liu-01/agent-machines" />

			<main id="top">
				<ReticleSection
					borderTop={false}
					contentClassName="px-3 pt-8 pb-0 md:px-4 md:pt-10"
				>
					<HeroBlock />
				</ReticleSection>

				<ReticleBand hatchMargins contentClassName="px-3 py-3 md:px-4 md:py-4">
					<StatsRow />
				</ReticleBand>

				<ReticleSection
					id="workflow"
					contentClassName="px-3 py-5 md:px-4 md:py-6"
				>
					<WorkflowNavigator />
				</ReticleSection>

				<ReticleSection
					id="agents"
					contentClassName="px-3 py-5 md:px-4 md:py-6"
				>
					<ReticleLabel>AGENTS</ReticleLabel>
					<h2 className="ret-display mt-2 text-xl md:text-2xl">
						Chat and terminal commands for every agent.
					</h2>
					<p className="mt-2 max-w-[72ch] text-[12px] text-[var(--ret-text-dim)]">
						Autonomous agents have built-in drivers that wake up on schedule.
						Task-driven CLIs run per-task but can be automated via headless
						flags and cron.
					</p>
					<div className="mt-4">
						<AgentCommandToggle />
					</div>
				</ReticleSection>

				<ReticleSection
					id="loadout"
					contentClassName="px-3 py-5 md:px-4 md:py-6"
				>
					<LoadoutPreview />
				</ReticleSection>

				<ReticleBand id="runtime" hatchMargins contentClassName="px-3 py-5 md:px-4 md:py-6">
					<RuntimeVizGrid />
				</ReticleBand>

				<ReticleSection
					id="scroll-story"
					contentClassName="px-3 py-5 md:px-4 md:py-6"
				>
					<StickyRuntimeStory />
				</ReticleSection>

				<ReticleBand id="faq" hatchMargins contentClassName="px-3 py-5 md:px-4 md:py-6">
					<FaqSection />
				</ReticleBand>
			</main>

			<Footer />
		</ReticlePageGrid>
	);
}
