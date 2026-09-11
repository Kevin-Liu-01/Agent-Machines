import { ArrowRight, Terminal as TerminalIcon } from "@/components/ui/icons";
import Link from "next/link";
import type { ReactNode } from "react";

import { Footer } from "@/components/Footer";
import { GitHubStarLink } from "@/components/GitHubStarLink";
import { PublicNavbar } from "@/components/PublicNavbar";
import { PublicIcon } from "@/components/marketing/PublicIcon";
import { ReticlePageGrid } from "@/components/reticle/ReticlePageGrid";
import { ReticleSection } from "@/components/reticle/ReticleSection";
import { ReticleSpacer } from "@/components/reticle/ReticleSpacer";
import type { MarketingMetric, MarketingStep, PublicIconName } from "@/lib/marketing/public-site";
import { LANDING_INSET, LANDING_SECTION_SPACE, LANDING_TITLE } from "@/lib/marketing/layout";
import { SITE } from "@/lib/seo/config";
import { cn } from "@/lib/cn";

export function MarketingShell({ children }: { children: ReactNode }) {
	return <ReticlePageGrid>
		<PublicNavbar githubRepo={SITE.githubRepo} githubLink={<GitHubStarLink repo={SITE.githubRepo} />} />
		<div>{children}</div>
		<Footer />
	</ReticlePageGrid>;
}

type HeroProps = {
	kicker: string;
	title: string;
	description: string;
	badges?: ReadonlyArray<string>;
	icon?: PublicIconName;
	aside?: ReactNode;
	actions?: ReactNode;
};

export function MarketingHero({ kicker, title, description, badges = [], icon, aside, actions }: HeroProps) {
	return <ReticleSection contentClassName={cn(LANDING_INSET, LANDING_SECTION_SPACE)}>
		<div className={cn("grid items-center gap-8 lg:gap-12", Boolean(aside) && "lg:grid-cols-[minmax(0,1fr)_minmax(0,.85fr)]")}>
			<header className="min-w-0">
				<p className="mb-5 flex items-center gap-2 text-sm font-medium text-[var(--ret-text-dim)]">
					{icon ? <PublicIcon name={icon} className="size-4" /> : null}
					{kicker.replace(/^\.\//, "")}
				</p>
				<h1 className={cn(LANDING_TITLE, "max-w-[20ch] text-[var(--ret-text)]")}>{title}</h1>
				<p className="mt-5 max-w-[58ch] text-base leading-7 text-[var(--ret-text-dim)]">{description}</p>
				{actions ? <div className="mt-7 flex flex-wrap gap-3">{actions}</div> : null}
				{badges.length ? <ul aria-label="At a glance" className="mt-6 flex list-none flex-wrap gap-x-4 gap-y-2 p-0 text-xs text-[var(--ret-text-muted)]">
					{badges.map((badge) => <li key={badge} className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-1 rounded-full bg-[var(--ret-text-muted)]/60" />{badge}</li>)}
				</ul> : null}
			</header>
			{aside ? <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--ret-border)]/50 bg-[var(--ret-bg-soft)]/30">{aside}</div> : null}
		</div>
	</ReticleSection>;
}

export function MetricGrid({ metrics }: { metrics: ReadonlyArray<MarketingMetric> }) {
	return <dl className="grid gap-6 rounded-lg border border-[var(--ret-border)]/40 p-5 md:grid-cols-3 md:gap-0 md:p-6">
		{metrics.map((metric, index) => <div key={`${metric.label}-${metric.value}`} className={cn("min-w-0", index > 0 && "border-t border-[var(--ret-border)]/30 pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0", index < metrics.length - 1 && "md:pr-6")}>
			<dt className="text-sm text-[var(--ret-text-muted)]">{metric.label}</dt>
			<dd className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ret-text)] tabular-nums">{metric.value}</dd>
			<dd className="mt-2 text-sm leading-6 text-[var(--ret-text-dim)]">{metric.detail}</dd>
		</div>)}
	</dl>;
}

export function FlowSteps({ steps }: { steps: ReadonlyArray<MarketingStep> }) {
	return <ol className="m-0 list-none divide-y divide-[var(--ret-border)]/35 rounded-lg border border-[var(--ret-border)]/40 p-0">
		{steps.map((step, index) => <li key={step.label} className="grid grid-cols-[32px_minmax(0,1fr)] gap-x-4 gap-y-2 p-5 md:grid-cols-[32px_minmax(0,190px)_minmax(0,1fr)] md:items-start md:p-6">
			<span aria-hidden="true" className="row-span-2 flex size-8 items-center justify-center rounded-full bg-[var(--ret-surface)] text-sm text-[var(--ret-text-muted)] md:row-span-1">{index + 1}</span>
			<h3 className="pt-0.5 text-lg font-semibold tracking-tight text-[var(--ret-text)]">{step.label}</h3>
			<p className="col-start-2 text-base leading-7 text-[var(--ret-text-dim)] md:col-start-auto">{step.body}</p>
		</li>)}
	</ol>;
}

export function TerminalPanel({ title, lines, className }: { title: string; lines: ReadonlyArray<string>; className?: string }) {
	return <figure className={cn("min-w-0 overflow-hidden rounded-lg border border-[var(--ret-border)]/40 bg-[var(--ret-bg)]", className)}>
		<figcaption className="flex items-start gap-2 border-b border-[var(--ret-border)]/35 px-5 py-4 text-sm text-[var(--ret-text-dim)]">
			<TerminalIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{title}
		</figcaption>
		<ol className="m-0 list-none space-y-3 p-5 font-mono text-[13px] leading-6 text-[var(--ret-text-dim)]">
			{lines.map((line, index) => <li key={`${index}-${line}`} className="grid grid-cols-[20px_minmax(0,1fr)] gap-3">
				<span aria-hidden="true" className="select-none text-xs text-[var(--ret-text-muted)]/65">{index + 1}</span>
				<span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{line}</span>
			</li>)}
		</ol>
	</figure>;
}

export function LinkCard({ href, title, description, icon }: { href: string; title: string; description: string; icon: PublicIconName }) {
	return <Link href={href} className="group flex min-h-[160px] flex-col rounded-lg border border-[var(--ret-border)]/45 bg-[var(--ret-bg)] p-5 transition-[border-color,background-color] duration-150 hover:border-[var(--ret-border-hover)] hover:bg-[var(--ret-bg-soft)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ret-purple)] motion-reduce:transition-none">
		<div className="mb-4 flex items-center justify-between gap-4"><PublicIcon name={icon} className="size-5 text-[var(--ret-text-dim)]" /><ArrowRight className="size-4 text-[var(--ret-text-muted)] group-hover:text-[var(--ret-text)]" aria-hidden="true" /></div>
		<h3 className="text-lg font-semibold tracking-tight text-[var(--ret-text)]">{title}</h3>
		<p className="mt-2 text-sm leading-6 text-[var(--ret-text-dim)]">{description}</p>
	</Link>;
}

export function SectionBand({ label, title, children }: { label: string; title: string; children: ReactNode }) {
	return <ReticleSection contentClassName={cn(LANDING_INSET, LANDING_SECTION_SPACE)}>
		<header className="mb-7 max-w-[760px]">
			<p className="mb-3 text-sm font-medium text-[var(--ret-text-muted)]">{label}</p>
			<h2 className="text-2xl font-semibold leading-tight tracking-tight text-[var(--ret-text)] md:text-3xl">{title}</h2>
		</header>
		{children}
	</ReticleSection>;
}

export { ReticleSpacer };
