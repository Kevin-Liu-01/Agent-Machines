import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { Footer } from "@/components/Footer";
import { PublicNavbar } from "@/components/PublicNavbar";
import { PublicIcon } from "@/components/marketing/PublicIcon";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ReticlePageGrid } from "@/components/reticle/ReticlePageGrid";
import { ReticleSection } from "@/components/reticle/ReticleSection";
import { ReticleSpacer } from "@/components/reticle/ReticleSpacer";
import type { MarketingMetric, MarketingStep, PublicIconName } from "@/lib/marketing/public-site";
import { SITE } from "@/lib/seo/config";
import { cn } from "@/lib/cn";

type ShellProps = {
	children: ReactNode;
};

export function MarketingShell({ children }: ShellProps) {
	return (
		<ReticlePageGrid>
			<PublicNavbar githubRepo={SITE.githubRepo} />
			{children}
			<Footer />
		</ReticlePageGrid>
	);
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

export function MarketingHero({
	kicker,
	title,
	description,
	badges = [],
	icon,
	aside,
	actions,
}: HeroProps) {
	return (
		<ReticleSection contentClassName="px-6 pt-14 pb-16 md:pt-20 md:pb-20">
			<div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-stretch">
				<div className="min-w-0">
					<div
						className="ret-page-enter flex flex-wrap items-center gap-3"
						style={{ "--item-index": 0 } as CSSProperties}
					>
						<ReticleLabel>{kicker}</ReticleLabel>
						{badges.slice(0, 4).map((badge) => (
							<ReticleBadge key={badge} variant="accent" className="rounded-[var(--ret-card-radius)]">
								{badge}
							</ReticleBadge>
						))}
					</div>
					<div
						className="ret-page-enter mt-7 flex items-start gap-5"
						style={{ "--item-index": 1 } as CSSProperties}
					>
						{icon ? (
							<div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-[var(--ret-card-radius)] border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] text-[var(--ret-text)] sm:flex">
								<PublicIcon name={icon} className="h-7 w-7" />
							</div>
						) : null}
						<div className="min-w-0">
							<h1 className="ret-display max-w-[16ch] text-[38px] leading-none tracking-normal text-[var(--ret-text)] md:text-[56px]">
								{title}
							</h1>
							<p className="mt-6 max-w-[70ch] text-[16px] leading-relaxed text-[var(--ret-text-dim)] md:text-[18px]">
								{description}
							</p>
							{actions ? <div className="mt-8 flex flex-wrap gap-3">{actions}</div> : null}
						</div>
					</div>
				</div>
				{aside ? (
					<div
						className="ret-page-enter min-w-0 rounded-[var(--ret-card-radius)] border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]"
						style={{ "--item-index": 2 } as CSSProperties}
					>
						{aside}
					</div>
				) : null}
			</div>
		</ReticleSection>
	);
}

export function MetricGrid({ metrics }: { metrics: ReadonlyArray<MarketingMetric> }) {
	return (
		<div className="grid border border-[var(--ret-border)] bg-[var(--ret-bg)] md:grid-cols-3">
			{metrics.map((metric, index) => (
				<div
					key={`${metric.label}-${metric.value}`}
					className={cn(
						"ret-page-enter p-5 tabular-nums",
						index > 0 ? "border-t border-[var(--ret-border)] md:border-l md:border-t-0" : null,
					)}
					style={{ "--item-index": index } as CSSProperties}
				>
					<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						{metric.label}
					</p>
					<p className="mt-3 font-mono text-2xl text-[var(--ret-text)]">
						{metric.value}
					</p>
					<p className="mt-2 text-[13px] text-[var(--ret-text-dim)]">
						{metric.detail}
					</p>
				</div>
			))}
		</div>
	);
}

export function FlowSteps({ steps }: { steps: ReadonlyArray<MarketingStep> }) {
	return (
		<div className="grid gap-3 md:grid-cols-3">
			{steps.map((step, index) => (
				<div
					key={step.label}
					className="ret-page-enter relative rounded-[var(--ret-card-radius)] border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-5"
					style={{ "--item-index": index } as CSSProperties}
				>
					<p className="font-mono text-[11px] text-[var(--ret-text-muted)]">
						{String(index + 1).padStart(2, "0")}
					</p>
					<h3 className="mt-5 text-[18px] font-semibold tracking-tight text-[var(--ret-text)]">
						{step.label}
					</h3>
					<p className="mt-2 text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
						{step.body}
					</p>
				</div>
			))}
		</div>
	);
}

export function TerminalPanel({
	title,
	lines,
	className,
}: {
	title: string;
	lines: ReadonlyArray<string>;
	className?: string;
}) {
	return (
		<div className={cn("rounded-[var(--ret-card-radius)] border border-[var(--ret-border)] bg-[var(--ret-bg)]", className)}>
			<div className="flex items-center justify-between border-b border-[var(--ret-border)] px-4 py-3">
				<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{title}
				</p>
				<div className="flex gap-1.5" aria-hidden="true">
					<span className="h-2 w-2 rounded-full bg-[var(--ret-border-strong)]" />
					<span className="h-2 w-2 rounded-full bg-[var(--ret-border-hover)]" />
					<span className="h-2 w-2 rounded-full bg-[var(--ret-border-hover)]" />
				</div>
			</div>
			<pre className="overflow-hidden p-4 font-mono text-[12px] leading-7 text-[var(--ret-text-dim)]">
				{lines.map((line) => (
					<span key={line} className="block truncate">
						<span className="text-[var(--ret-text-muted)]">&gt; </span>
						{line}
					</span>
				))}
			</pre>
		</div>
	);
}

export function LinkCard({
	href,
	title,
	description,
	icon,
}: {
	href: string;
	title: string;
	description: string;
	icon: PublicIconName;
}) {
	return (
		<Link
			href={href}
			className="ret-interactive-card ret-pressable group grid min-h-[152px] rounded-[var(--ret-card-radius)] border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-5 hover:border-[var(--ret-border-hover)] hover:bg-[var(--ret-surface-hover)]"
		>
			<div className="flex items-start justify-between gap-3">
				<span className="ret-card-icon flex h-11 w-11 items-center justify-center rounded-[var(--ret-card-radius)] border border-[var(--ret-border)] bg-[var(--ret-bg)] text-[var(--ret-text-muted)] group-hover:text-[var(--ret-text)]">
					<PublicIcon name={icon} className="h-5 w-5" />
				</span>
				<ArrowRight className="ret-card-arrow h-4 w-4 text-[var(--ret-text-muted)] group-hover:text-[var(--ret-text)]" />
			</div>
			<div className="mt-8">
				<h2 className="text-[18px] font-semibold tracking-tight text-[var(--ret-text)]">
					{title}
				</h2>
				<p className="mt-2 text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
					{description}
				</p>
			</div>
		</Link>
	);
}

export function SectionBand({
	label,
	title,
	children,
}: {
	label: string;
	title: string;
	children: ReactNode;
}) {
	return (
		<ReticleSection contentClassName="px-6 py-12 md:py-14">
			<div className="mb-7 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
				<div className="ret-page-enter" style={{ "--item-index": 0 } as CSSProperties}>
					<ReticleLabel>{label}</ReticleLabel>
					<h2 className="ret-display mt-2 text-2xl text-[var(--ret-text)] md:text-3xl">
						{title}
					</h2>
				</div>
			</div>
			{children}
		</ReticleSection>
	);
}

export { ReticleSpacer };
