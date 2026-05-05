import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";
import { CapabilityGrid } from "@/components/CapabilityGrid";
import { Chat } from "@/components/Chat";
import { CronSection } from "@/components/CronSection";
import { Footer } from "@/components/Footer";
import { HeroBlock } from "@/components/HeroBlock";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ReticleNavbar } from "@/components/reticle/ReticleNavbar";
import { ReticlePageGrid } from "@/components/reticle/ReticlePageGrid";
import { ReticleSection } from "@/components/reticle/ReticleSection";
import { SkillsManifest } from "@/components/SkillsManifest";

export default function HomePage() {
	return (
		<ReticlePageGrid>
			<ReticleNavbar>
				<div className="flex h-14 items-center justify-between px-6">
					<a
						href="#top"
						className="flex items-center gap-2.5 font-mono text-sm text-[var(--ret-text)]"
					>
						<span className="grid h-7 w-7 place-items-center rounded border border-[var(--ret-border)] bg-[var(--ret-surface)] text-[var(--ret-purple)]">
							{"☤"}
						</span>
						hermes-machines
					</a>
					<div className="hidden items-center gap-6 font-mono text-xs text-[var(--ret-text-dim)] md:flex">
						<a href="#chat" className="hover:text-[var(--ret-text)]">
							chat
						</a>
						<a href="#capabilities" className="hover:text-[var(--ret-text)]">
							capabilities
						</a>
						<a href="#skills" className="hover:text-[var(--ret-text)]">
							skills
						</a>
						<a href="#architecture" className="hover:text-[var(--ret-text)]">
							architecture
						</a>
						<a
							href="https://github.com/Kevin-Liu-01/hermes-machines"
							target="_blank"
							rel="noreferrer"
							className="hover:text-[var(--ret-text)]"
						>
							github
						</a>
					</div>
				</div>
			</ReticleNavbar>

			<main id="top">
				<ReticleSection
					borderTop={false}
					contentClassName="px-6 pt-14 pb-16 md:pt-20 md:pb-20"
				>
					<HeroBlock />
				</ReticleSection>

				<ReticleSection
					id="chat"
					contentClassName="px-6 pt-12 pb-16"
				>
					<ReticleLabel>LIVE — talk to the deployed agent</ReticleLabel>
					<h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
						Chat
					</h2>
					<p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-[var(--ret-text-dim)] md:text-base">
						This box streams from{" "}
						<code className="rounded border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1 font-mono text-[0.85em]">
							/v1/chat/completions
						</code>{" "}
						on the deployed machine. Tools fire on the VM. Memory persists between
						sessions.
					</p>
					<div className="mt-7">
						<Chat />
					</div>
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
