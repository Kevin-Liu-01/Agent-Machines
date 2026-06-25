import {
	LinkCard,
	MarketingHero,
	MarketingShell,
	ReticleSpacer,
	SectionBand,
	TerminalPanel,
} from "@/components/marketing/MarketingPage";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { PRODUCT_FEATURES } from "@/lib/marketing/public-site";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
	title: "Product",
	description:
		"Explore Agent Machines product capabilities: runtime routing, sandbox routing, model paths, loadouts, lifecycle controls, observability, and SDK APIs.",
	path: "/product",
	keywords: ["agent product", "runtime router", "sandbox router", "worker observability"],
});

export default function ProductPage() {
	return (
		<MarketingShell>
			<main id="top">
				<MarketingHero
					kicker="./PRODUCT"
					title="Agent workers with inspectable state."
					description="Agent Machines combines runtime, provider lane, model path, environment profile, loadout, logs, usage, cron, and artifacts into one worker control plane."
					badges={["runtimes", "providers", "loadouts", "usage"]}
					icon="server"
					actions={
						<>
							<ReticleButton as="a" href="/sign-in" size="lg" className="rounded-[var(--ret-card-radius)]">
								Start for free
							</ReticleButton>
							<ReticleButton as="a" href="/docs" variant="secondary" size="lg" className="rounded-[var(--ret-card-radius)]">
								Read docs
							</ReticleButton>
						</>
					}
					aside={
						<TerminalPanel
							title="worker recipe"
							lines={[
								"runtime: hermes | openclaw | claude | codex",
								"provider: e2b | sprites | dedalus | vercel",
								"model: router profile or native key",
								"loadout: skills + MCP + CLI + cron",
								"observe: logs + usage + artifacts",
							]}
							className="h-full rounded-none border-0"
						/>
					}
				/>
				<ReticleSpacer />
				<SectionBand label="Capabilities" title="Every public product page is live.">
					<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
						{PRODUCT_FEATURES.map((feature) => (
							<LinkCard
								key={feature.slug}
								href={feature.href}
								title={feature.title}
								description={feature.description}
								icon={feature.icon}
							/>
						))}
					</div>
				</SectionBand>
				<ReticleSpacer />
			</main>
		</MarketingShell>
	);
}
