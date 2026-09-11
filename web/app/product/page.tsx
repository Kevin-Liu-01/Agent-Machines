import { CapabilityAtlas } from "@/components/CapabilityAtlas";
import { ProductShowcase } from "@/components/ProductShowcase";
import { HarnessComponentsSection } from "@/components/marketing/HarnessComponents";
import {
	MarketingHero,
	MarketingShell,
	ReticleSpacer,
	TerminalPanel,
} from "@/components/marketing/MarketingPage";
import { WorkerSystemThesis } from "@/components/WorkerSystemThesis";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
	title: "Product",
	description:
		"Build an agent setup from open-source runtime adapters, sandbox providers, tools, memory documents, and browser terminals. Inspect the source and customize each layer.",
	path: "/product",
	keywords: ["agent product", "runtime router", "sandbox router", "worker observability"],
});

export default function ProductPage() {
	return (
		<MarketingShell>
			<main id="top">
				<MarketingHero
					kicker="Product"
					title="Your agent setup. Built from open parts."
					description="Real agent runtimes, your tools, and a remote workspace. Configure each layer in the dashboard or adapt the open-source implementation."
					badges={["MIT source", "Runtime adapters", "Your credentials", "Real CLIs"]}
					icon="server"
					actions={
						<>
							<ReticleButton as="a" href="/dashboard/agents" size="lg" className="rounded-[var(--ret-card-radius)]">
								Build your setup
							</ReticleButton>
							<ReticleButton as="a" href="/docs" variant="secondary" size="lg" className="rounded-[var(--ret-card-radius)]">
								Read docs
							</ReticleButton>
						</>
					}
					aside={
						<TerminalPanel
								title="The configurable layers · overview"
							lines={[
									"runtime: hermes | openclaw | claude-code | codex",
								"provider: e2b | sprites | daytona | vercel",
									"model: supported router profile or native key",
								"loadout: skills + MCP + CLI + cron",
								"observe: logs + usage + artifacts",
							]}
							className="h-full rounded-none border-0"
						/>
					}
				/>
				<ReticleSpacer />
				<HarnessComponentsSection />
				<ReticleSpacer />
				<WorkerSystemThesis />
				<ReticleSpacer />
				<ProductShowcase />
				<ReticleSpacer />
				<CapabilityAtlas />
				<ReticleSpacer />
			</main>
		</MarketingShell>
	);
}
