import { ArchitectureFlow } from "@/components/ArchitectureFlow";
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
import { ReticleSpacer } from "@/components/reticle/ReticleSpacer";
import { SkillsManifest } from "@/components/SkillsManifest";
import { StatsRow } from "@/components/StatsRow";

export default function HomePage() {
	return (
		<ReticlePageGrid>
			<PublicNavbar githubRepo="Kevin-Liu-01/agent-machines" />

			<main id="top">
				<ReticleSection
					borderTop={false}
					contentClassName="px-6 pt-14 pb-12 md:pt-16 md:pb-14"
				>
					<HeroBlock />
				</ReticleSection>

				{/*
				  StatsRow rides as its own band so its surrounding hairlines
				  extend edge-to-edge through the page rails, with hatching
				  filling the margin strips. Reads as a structural ledger
				  beneath the hero copy.
				*/}
				<ReticleBand hatchMargins contentClassName="px-6 py-6 md:py-8">
					<StatsRow />
				</ReticleBand>

				<ReticleSpacer />

				<ReticleSection id="capabilities" background="wing-cloud" borderTop={false}>
					<CapabilityGrid />
				</ReticleSection>

				<ReticleSpacer />

				<ReticleBand id="runtime" hatchMargins contentClassName="px-6 py-10 md:py-14">
					<RuntimeVizGrid />
				</ReticleBand>

				<ReticleSpacer />

				<ReticleSection id="loadout" background="wing-nyx-lines" borderTop={false}>
					<LoadoutPreview />
				</ReticleSection>

				<ReticleSpacer />

				<ReticleSection id="components" borderTop={false}>
					<ComponentShowcase />
					<ShowcaseAttribution />
				</ReticleSection>

				<ReticleSpacer />

				<ReticleSection id="skills" borderTop={false}>
					<SkillsManifest />
				</ReticleSection>

				<ReticleSpacer />

				<ReticleSection id="architecture" background="wing-nyx-waves" borderTop={false}>
					<ArchitectureFlow />
				</ReticleSection>

				<ReticleSpacer />

				<ReticleBand id="faq" hatchMargins contentClassName="px-6 py-10 md:py-14">
					<FaqSection />
				</ReticleBand>
			</main>

			<Footer />
		</ReticlePageGrid>
	);
}
