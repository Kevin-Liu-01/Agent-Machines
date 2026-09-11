import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
	FlowSteps,
	MarketingHero,
	MarketingShell,
	MetricGrid,
	ReticleSpacer,
	SectionBand,
	TerminalPanel,
} from "@/components/marketing/MarketingPage";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import {
	PRODUCT_FEATURES,
	productFeatureBySlug,
} from "@/lib/marketing/public-site";
import { buildPageMetadata } from "@/lib/seo/metadata";

type Params = {
	params: Promise<{ slug: string }>;
};

const FEATURE_ACTIONS: Record<string, { href: string; label: string }> = {
	"persistent-machines": { href: "/dashboard/machines", label: "Open your machines" },
	"model-routing": { href: "/dashboard/settings", label: "Connect model access" },
	isolation: { href: "/dashboard/settings", label: "Review your credentials" },
	lifecycle: { href: "/dashboard/machines", label: "Manage your machines" },
	"snapshots-volumes": { href: "/dashboard/machines", label: "Inspect your machines" },
	api: { href: "/dashboard/settings", label: "Manage API keys" },
};

export function generateStaticParams() {
	return PRODUCT_FEATURES.map((feature) => ({ slug: feature.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
	const { slug } = await params;
	const feature = productFeatureBySlug(slug);
	if (!feature) return {};
	return buildPageMetadata({
		title: feature.title,
		description: feature.description,
		path: feature.href,
		keywords: [feature.eyebrow, ...feature.badges],
	});
}

export default async function ProductFeaturePage({ params }: Params) {
	const { slug } = await params;
	const feature = productFeatureBySlug(slug);
	if (!feature) notFound();
	const action = FEATURE_ACTIONS[slug] ?? { href: "/dashboard/agents", label: "Configure an agent" };

	return (
		<MarketingShell>
			<main id="top">
				<MarketingHero
					kicker={feature.eyebrow}
					title={feature.title}
					description={feature.longDescription}
					badges={feature.badges}
					icon={feature.icon}
					actions={
						<>
							<ReticleButton as="a" href={action.href} size="lg" className="rounded-[var(--ret-card-radius)]">
								{action.label}
							</ReticleButton>
							<ReticleButton as="a" href="/components" variant="secondary" size="lg" className="rounded-[var(--ret-card-radius)]">
								Explore the components
							</ReticleButton>
						</>
					}
					aside={
						<TerminalPanel
							title="configuration illustration · not execution output"
							lines={feature.terminal}
							className="h-full rounded-none border-0"
						/>
					}
				/>
				<ReticleSpacer />
				<SectionBand label="Capabilities" title="What you can use.">
					<MetricGrid metrics={feature.metrics} />
				</SectionBand>
				<ReticleSpacer />
				<SectionBand label="Workflow" title="From setup to result.">
					<FlowSteps steps={feature.steps} />
				</SectionBand>
				<ReticleSpacer />
			</main>
		</MarketingShell>
	);
}
