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
		"Browse skills, MCP servers, CLI tools, plugins, service routes, and source entries for persistent Agent Machines workers.",
	path: "/registry",
	keywords: ["agent registry", "MCP registry", "SKILL.md skills", "agent loadout"],
});

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
