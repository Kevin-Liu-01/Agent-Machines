import { UserButton } from "@clerk/nextjs";

import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";
import { SignedIn, SignedOut } from "@/components/AuthSwitch";
import { BrandMark } from "@/components/BrandMark";
import { CapabilityGrid } from "@/components/CapabilityGrid";
import { CronSection } from "@/components/CronSection";
import { Footer } from "@/components/Footer";
import { HeroBlock } from "@/components/HeroBlock";
import { LandingCTA } from "@/components/LandingCTA";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleNavbar } from "@/components/reticle/ReticleNavbar";
import { ReticlePageGrid } from "@/components/reticle/ReticlePageGrid";
import { ReticleSection } from "@/components/reticle/ReticleSection";
import { SkillsManifest } from "@/components/SkillsManifest";
import { StackRow } from "@/components/StackRow";
import { StatsRow } from "@/components/StatsRow";
import { TempleDivider } from "@/components/TempleDivider";

const CLERK_READY = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function HomePage() {
	return (
		<ReticlePageGrid>
			<ReticleNavbar>
				<div className="flex h-14 items-center justify-between px-6">
					<a
						href="#top"
						className="flex items-center"
					>
						<BrandMark size={24} />
					</a>
					<div className="flex items-center gap-5 font-mono text-xs text-[var(--ret-text-dim)]">
						<a href="#capabilities" className="hidden hover:text-[var(--ret-text)] md:inline">
							capabilities
						</a>
						<a href="#skills" className="hidden hover:text-[var(--ret-text)] md:inline">
							skills
						</a>
						<a href="#architecture" className="hidden hover:text-[var(--ret-text)] md:inline">
							architecture
						</a>
						<a
							href="https://github.com/Kevin-Liu-01/hermes-machines"
							target="_blank"
							rel="noreferrer"
							className="hidden hover:text-[var(--ret-text)] md:inline"
						>
							github
						</a>
						<SignedIn>
							<ReticleButton as="a" href="/dashboard" variant="primary" size="sm">
								Dashboard
							</ReticleButton>
							{CLERK_READY ? (
								<UserButton
									appearance={{ elements: { avatarBox: "h-7 w-7" } }}
								/>
							) : null}
						</SignedIn>
						<SignedOut>
							<ReticleButton as="a" href="/sign-in" variant="primary" size="sm">
								Sign in
							</ReticleButton>
						</SignedOut>
					</div>
				</div>
			</ReticleNavbar>

			<main id="top">
				<ReticleSection
					borderTop={false}
					contentClassName="px-6 pt-14 pb-16 md:pt-20 md:pb-12"
				>
					<HeroBlock />
					<StatsRow />
					<StackRow />
				</ReticleSection>

				<TempleDivider />

				<ReticleSection contentClassName="px-6 pt-12 pb-16">
					<LandingCTA />
				</ReticleSection>

				<ReticleSection id="capabilities" contentClassName="px-6 pt-12 pb-16">
					<CapabilityGrid />
				</ReticleSection>

				<ReticleSection id="skills" contentClassName="px-6 pt-12 pb-16">
					<SkillsManifest />
				</ReticleSection>

				<ReticleSection contentClassName="px-6 pt-12 pb-16">
					<CronSection />
				</ReticleSection>

				<ReticleSection id="architecture" contentClassName="px-6 pt-12 pb-20">
					<ArchitectureDiagram />
				</ReticleSection>
			</main>

			<Footer />
		</ReticlePageGrid>
	);
}
