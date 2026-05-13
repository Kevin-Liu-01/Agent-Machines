import type { ReactNode } from "react";

import { Footer } from "@/components/Footer";
import { PublicNavbar } from "@/components/PublicNavbar";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ReticlePageGrid } from "@/components/reticle/ReticlePageGrid";
import { ReticleSection } from "@/components/reticle/ReticleSection";
import { ReticleSpacer } from "@/components/reticle/ReticleSpacer";
import { SITE } from "@/lib/seo/config";

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
			<PublicNavbar githubRepo={SITE.githubRepo} />
			<main id="top">
				<ReticleSection
					contentClassName="px-6 pt-14 pb-16 md:pt-16 md:pb-20"
				>
					<div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
						<div className="min-w-0">
							<div className="flex flex-wrap items-center gap-2">
								<ReticleLabel>{kicker}</ReticleLabel>
								{badge ? <ReticleBadge variant="accent">{badge}</ReticleBadge> : null}
							</div>
							<h1 className="ret-display mt-5 text-3xl leading-[1.05] md:text-[44px]">
								{title}
							</h1>
							<p className="mt-5 max-w-[72ch] text-[14px] leading-relaxed text-[var(--ret-text-dim)]">
								{description}
							</p>
						</div>
						{aside ? (
							<aside className="border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-4 font-mono text-[11px] text-[var(--ret-text-dim)]">
								{aside}
							</aside>
						) : null}
					</div>
				</ReticleSection>
				<ReticleSpacer />
				<ReticleSection contentClassName="px-6 py-12 md:py-14">
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
		<section className="grid gap-4 border-t border-[var(--ret-border)] py-6 first:border-t-0 first:pt-0 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
			<h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
				{title}
			</h2>
			<div className="space-y-3 text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
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
			<span className="mt-[0.55em] h-1 w-1 shrink-0 bg-[var(--ret-purple)]" />
			<span>{children}</span>
		</li>
	);
}
