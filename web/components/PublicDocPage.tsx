import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

import { Footer } from "@/components/Footer";
import { GitHubStarLink } from "@/components/GitHubStarLink";
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
			<PublicNavbar
				githubRepo={SITE.githubRepo}
				githubLink={<GitHubStarLink repo={SITE.githubRepo} />}
			/>
			<main id="top">
				<ReticleSection contentClassName="px-5 pt-10 pb-12 md:px-6 md:pt-16 md:pb-16">
					<div className="border border-[var(--ret-border)] bg-[var(--ret-bg)]">
						<div className="grid lg:grid-cols-[minmax(0,1fr)_360px]">
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2 border-b border-[var(--ret-border)] px-4 py-3 md:px-5">
									<ReticleLabel>{kicker}</ReticleLabel>
									<span className="hidden h-px flex-1 bg-[var(--ret-border)] md:block" aria-hidden="true" />
									{badge ? <ReticleBadge variant="default">{badge}</ReticleBadge> : null}
								</div>
								<div className="px-4 py-8 md:px-6 md:py-10">
									<h1 className="ret-display max-w-[18ch] text-[34px] leading-[0.98] md:text-[54px]">
										{title}
									</h1>
									<p className="mt-5 max-w-[72ch] text-[14px] leading-relaxed text-[var(--ret-text-dim)] md:text-[16px]">
										{description}
									</p>
								</div>
							</div>
							{aside ? (
								<aside className="border-t border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-4 font-mono text-[11px] leading-relaxed text-[var(--ret-text-dim)] lg:border-l lg:border-t-0">
									{aside}
								</aside>
							) : null}
						</div>
					</div>
				</ReticleSection>
				<ReticleSpacer />
				<ReticleSection contentClassName="px-5 py-10 md:px-6 md:py-12">
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
		<section className="grid border border-b-0 border-[var(--ret-border)] bg-[var(--ret-bg)] last:border-b md:grid-cols-[200px_minmax(0,1fr)]">
			<div className="border-b border-[var(--ret-border)] px-4 py-4 md:border-b-0 md:border-r">
				<h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
					{title}
				</h2>
			</div>
			<div className="space-y-3 px-4 py-4 text-[13px] leading-relaxed text-[var(--ret-text-dim)] md:px-5">
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
