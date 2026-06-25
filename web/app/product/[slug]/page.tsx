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

	return (
		<MarketingShell>
			<main id="top">
				<MarketingHero
					kicker={`./${feature.eyebrow.toUpperCase()}`}
					title={feature.title}
					description={feature.longDescription}
					badges={feature.badges}
					icon={feature.icon}
					actions={
						<>
							<ReticleButton as="a" href="/sign-in" size="lg" className="rounded-[var(--ret-card-radius)]">
								Start for free
							</ReticleButton>
							<ReticleButton as="a" href="/product" variant="secondary" size="lg" className="rounded-[var(--ret-card-radius)]">
								Product index
							</ReticleButton>
						</>
					}
					aside={
						<TerminalPanel
							title="capability trace"
							lines={feature.terminal}
							className="h-full rounded-none border-0"
						/>
					}
				/>
				<ReticleSpacer />
				<SectionBand label="Metrics" title="The dashboard surfaces the moving parts.">
					<MetricGrid metrics={feature.metrics} />
				</SectionBand>
				<ReticleSpacer />
				<SectionBand label="Flow" title="How this works inside a machine.">
					<FlowSteps steps={feature.steps} />
				</SectionBand>
				<ReticleSpacer />
			</main>
		</MarketingShell>
	);
}
