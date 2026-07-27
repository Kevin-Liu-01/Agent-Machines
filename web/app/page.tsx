import { ContributionGrid } from "@/components/ContributionGrid";
import { FleetDemo } from "@/components/FleetDemo";
import { FaqSection } from "@/components/FaqSection";
import { Footer } from "@/components/Footer";
import { GitHubStarLink } from "@/components/GitHubStarLink";
import { HeroBlock } from "@/components/HeroBlock";
import { PublicNavbar } from "@/components/PublicNavbar";
import { ProductShowcase } from "@/components/ProductShowcase";
import { ReticlePageGrid } from "@/components/reticle/ReticlePageGrid";
import { ReticleSection } from "@/components/reticle/ReticleSection";
import { ReticleSpacer } from "@/components/reticle/ReticleSpacer";
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

				<ReticleSection id="workflow" className="scroll-mt-[72px]" contentClassName="">
					<ProductShowcase />
				</ReticleSection>

				<ReticleSpacer />

				<ReticleSection contentClassName="" background="wing-nyx-waves">
					<ContributionGrid />
				</ReticleSection>

				<ReticleSpacer />

				<ReticleSection id="faq" contentClassName="">
					<FaqSection />
				</ReticleSection>

				<ReticleSpacer />
			</main>

			<Footer />
		</ReticlePageGrid>
	);
}
