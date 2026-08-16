import { CapabilityAtlas } from "@/components/CapabilityAtlas";
import { ProductShowcase } from "@/components/ProductShowcase";
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
		"Explore the durable Worker system: off-the-shelf specialists, modular runtimes and sandboxes, persistent state, lifecycle, supervision, and APIs.",
	path: "/product",
	keywords: ["agent product", "runtime router", "sandbox router", "worker observability"],
});

export default function ProductPage() {
	return (
		<MarketingShell>
			<main id="top">
				<MarketingHero
					kicker="./PRODUCT"
					title="Keep the Worker. Swap the machinery."
					description="Choose a persistent specialist or compose one from modular primitives. Its identity, responsibility, memory, files, schedules, permissions, history, and evidence survive changes to the runtime, model, tools, and sandbox."
					badges={["durable identity", "persistent work", "supervision", "portability"]}
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
