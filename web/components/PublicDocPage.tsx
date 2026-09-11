import { CheckCircle2 } from "@/components/ui/icons";
import type { ReactNode } from "react";

import { Footer } from "@/components/Footer";
import { GitHubStarLink } from "@/components/GitHubStarLink";
import { PublicNavbar } from "@/components/PublicNavbar";
import { ReticlePageGrid } from "@/components/reticle/ReticlePageGrid";
import { ReticleSection } from "@/components/reticle/ReticleSection";
import { ReticleSpacer } from "@/components/reticle/ReticleSpacer";
import { SITE } from "@/lib/seo/config";
import { MarketingHero } from "@/components/marketing/MarketingPage";
import { LANDING_INSET, LANDING_SECTION_SPACE } from "@/lib/marketing/layout";
import { cn } from "@/lib/cn";

type PublicDocPageProps = {
	kicker: string;
	title: string;
	description: string;
	badge?: string;
	children: ReactNode;
	aside?: ReactNode;
};

export function PublicDocPage({
	kicker,
	title,
	description,
	badge,
	children,
	aside,
}: PublicDocPageProps) {
	return (
		<ReticlePageGrid>
			<PublicNavbar
				githubRepo={SITE.githubRepo}
				githubLink={<GitHubStarLink repo={SITE.githubRepo} />}
			/>
			<main id="top">
				<MarketingHero kicker={kicker} title={title} description={description} badges={badge ? [badge] : []} aside={aside ? <aside className="p-6 text-sm leading-6 text-[var(--ret-text-dim)]">{aside}</aside> : undefined} />
				<ReticleSpacer />
				<ReticleSection contentClassName={cn(LANDING_INSET, LANDING_SECTION_SPACE)}>
					{children}
				</ReticleSection>
			</main>
			<Footer />
		</ReticlePageGrid>
	);
}

export function DocSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<section className="grid gap-4 border-t border-[var(--ret-border)]/40 bg-[var(--ret-bg)] py-7 md:grid-cols-[180px_minmax(0,1fr)] md:gap-8">
			<div>
				<h2 className="text-base font-medium text-[var(--ret-text-muted)]">
					{title}
				</h2>
			</div>
			<div className="min-w-0 space-y-4 text-base leading-7 text-[var(--ret-text-dim)]">
				{children}
			</div>
		</section>
	);
}

export function DocList({ children }: { children: ReactNode }) {
	return (
		<ul className="grid gap-2">
			{children}
		</ul>
	);
}

export function DocListItem({ children }: { children: ReactNode }) {
	return (
		<li className="flex gap-2">
			<CheckCircle2
				className="mt-[0.2em] h-4 w-4 shrink-0 text-[var(--ret-text-muted)]"
				strokeWidth={1.5}
			/>
			<span>{children}</span>
		</li>
	);
}
