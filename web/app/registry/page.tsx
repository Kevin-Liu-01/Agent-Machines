import {
	MarketingHero,
	MarketingShell,
	ReticleSpacer,
	TerminalPanel,
} from "@/components/marketing/MarketingPage";
import { PublicRegistryBrowser } from "@/components/PublicRegistryBrowser";
import { ReticleSection } from "@/components/reticle/ReticleSection";

export const metadata = {
	title: "Registry",
	description: "Browse skills, MCPs, CLI tools, and plugins for persistent agent workers.",
};

export default function RegistryPage() {
	return (
		<MarketingShell>
			<main id="top">
				<MarketingHero
					kicker="./REGISTRY"
					title="Find tools your workers can run."
					description="Search skills, MCP servers, CLIs, tools, plugins, and provider manifests from one clean browser. Sign in to attach items to a worker loadout."
					badges={["skills", "mcps", "cli", "plugins"]}
					icon="search"
					aside={
						<TerminalPanel
							title="sources"
							lines={[
								"skills.sh registry",
								"official MCP registry",
								"npm packages",
								"Cursor plugins",
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
