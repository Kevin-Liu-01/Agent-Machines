import { CapabilityGrid } from "@/components/CapabilityGrid";
import { RuntimeVizGrid } from "@/components/RuntimeVizGrid";
import {
	ComponentShowcase,
	ShowcaseAttribution,
} from "@/components/ComponentShowcase";
import { FaqSection } from "@/components/FaqSection";
import { Footer } from "@/components/Footer";
import { HeroBlock } from "@/components/HeroBlock";
import { LoadoutPreview } from "@/components/LoadoutPreview";
import { PublicNavbar } from "@/components/PublicNavbar";
import { ReticleBand } from "@/components/reticle/ReticleBand";
import { ReticlePageGrid } from "@/components/reticle/ReticlePageGrid";
import { ReticleSection } from "@/components/reticle/ReticleSection";
import { SkillsManifest } from "@/components/SkillsManifest";
import { StatsRow } from "@/components/StatsRow";
import { StickyRuntimeStory } from "@/components/StickyRuntimeStory";
import { WorkflowNavigator } from "@/components/WorkflowNavigator";
import { AgentGatewayDiagram } from "@/components/AgentGatewayDiagram";

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
					id="architecture"
					borderTop={false}
					contentClassName="px-3 py-5 md:px-4 md:py-6"
				>
					<AgentGatewayDiagram />
				</ReticleSection>

				<ReticleSection
					id="workflow"
					borderTop={false}
					contentClassName="px-3 py-5 md:px-4 md:py-6"
				>
					<WorkflowNavigator />
				</ReticleSection>

				<ReticleSection
					id="capabilities"
					borderTop={false}
					contentClassName="px-3 py-5 md:px-4 md:py-6"
				>
					<CapabilityGrid />
				</ReticleSection>

				<ReticleBand id="runtime" hatchMargins contentClassName="px-3 py-5 md:px-4 md:py-6">
					<RuntimeVizGrid />
				</ReticleBand>

				<ReticleSection
					id="scroll-story"
					borderTop={false}
					contentClassName="px-3 py-5 md:px-4 md:py-6"
				>
					<StickyRuntimeStory />
				</ReticleSection>

				<ReticleSection
					id="loadout"
					borderTop={false}
					contentClassName="px-3 py-5 md:px-4 md:py-6"
				>
					<LoadoutPreview />
				</ReticleSection>

				<ReticleSection
					id="components"
					borderTop={false}
					contentClassName="px-3 py-5 md:px-4 md:py-6"
				>
					<ComponentShowcase />
					<ShowcaseAttribution />
				</ReticleSection>

				<ReticleSection
					id="skills"
					borderTop={false}
					contentClassName="px-3 py-5 md:px-4 md:py-6"
				>
					<SkillsManifest />
				</ReticleSection>

				<ReticleBand id="faq" hatchMargins contentClassName="px-3 py-5 md:px-4 md:py-6">
					<FaqSection />
				</ReticleBand>
			</main>

			<Footer />
		</ReticlePageGrid>
	);
}
