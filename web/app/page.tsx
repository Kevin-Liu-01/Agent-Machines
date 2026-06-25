import { ContributionGrid } from "@/components/ContributionGrid";
import { FleetDemo } from "@/components/FleetDemo";
import { FaqSection } from "@/components/FaqSection";
import { Footer } from "@/components/Footer";
import { GitHubStarLink } from "@/components/GitHubStarLink";
import { HeroBlock } from "@/components/HeroBlock";
import { PublicNavbar } from "@/components/PublicNavbar";
import { ReticleBand } from "@/components/reticle/ReticleBand";
import { ReticlePageGrid } from "@/components/reticle/ReticlePageGrid";
import { ReticleSection } from "@/components/reticle/ReticleSection";
import { ReticleSpacer } from "@/components/reticle/ReticleSpacer";
import { StatsRow } from "@/components/StatsRow";
import { StickyRuntimeStory } from "@/components/StickyRuntimeStory";
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

				<ReticleSection id="workflow" className="scroll-mt-[72px]" contentClassName="">
					<WorkflowNavigator />
				</ReticleSection>

				<ReticleSpacer />

				<ReticleSection id="agents" contentClassName="">
					<StickyRuntimeStory />
				</ReticleSection>

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
