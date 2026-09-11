import {
	MarketingHero,
	MarketingShell,
	ReticleSpacer,
	TerminalPanel,
} from "@/components/marketing/MarketingPage";
import { PublicRegistryBrowser } from "@/components/PublicRegistryBrowser";
import { ReticleSection } from "@/components/reticle/ReticleSection";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
	title: "Registry",
	description:
		"Browse skill, MCP, CLI, and source entries for your agent setup. Inspect installation instructions, then configure runtime access and credentials.",
	path: "/registry",
	keywords: ["agent registry", "MCP registry", "SKILL.md skills", "agent loadout"],
});

export default function RegistryPage() {
	return (
		<MarketingShell>
			<main id="top">
				<MarketingHero
					kicker="Registry"
					title="Find the parts your agent needs."
					description="Search skills, MCP servers, and tools. Review an entry, then open it in your dashboard. Saving is not installation or verification; runtime access and credentials still need setup."
					badges={["Skills", "MCPs", "CLIs", "Plugins"]}
					icon="search"
					aside={
						<TerminalPanel
							title="Available catalog sources"
							lines={[
								"skills.sh registry",
								"official MCP registry",
								"npm packages",
								"GitHub repos",
							]}
							className="h-full border-0"
						/>
					}
				/>
				<ReticleSpacer />
				<ReticleSection contentClassName="px-5 py-10 md:px-6 md:py-12">
					<PublicRegistryBrowser />
				</ReticleSection>
				<ReticleSpacer />
			</main>
		</MarketingShell>
	);
}
