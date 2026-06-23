import {
	ArrowRight,
	CheckCircle2,
	Circle,
	Terminal as TerminalIcon,
} from "lucide-react";
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
		<ReticleSection contentClassName="px-5 pt-10 pb-12 md:px-6 md:pt-16 md:pb-16">
			<div className="border border-[var(--ret-border)] bg-[var(--ret-bg)]">
				<div className="grid lg:grid-cols-[minmax(0,1fr)_420px]">
					<div className="min-w-0">
						<div
							className="ret-page-enter flex flex-wrap items-center gap-2 border-b border-[var(--ret-border)] px-4 py-3 md:px-5"
							style={{ "--item-index": 0 } as CSSProperties}
						>
							{icon ? (
								<span className="inline-flex h-8 w-8 items-center justify-center border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] text-[var(--ret-text)]">
									<PublicIcon name={icon} className="h-4 w-4" />
								</span>
							) : null}
							<ReticleLabel>{kicker}</ReticleLabel>
							<span className="hidden h-px flex-1 bg-[var(--ret-border)] md:block" aria-hidden="true" />
							{badges.slice(0, 4).map((badge) => (
								<ReticleBadge
									key={badge}
									variant="default"
									className="font-mono text-[9px] uppercase tracking-[0.14em]"
								>
									{badge}
								</ReticleBadge>
							))}
						</div>
						<div
							className="ret-page-enter px-4 py-8 md:px-6 md:py-10"
							style={{ "--item-index": 1 } as CSSProperties}
						>
							<h1 className="ret-display max-w-[17ch] text-[34px] leading-[0.98] tracking-normal text-[var(--ret-text)] md:text-[54px]">
								{title}
							</h1>
							<p className="mt-5 max-w-[68ch] text-[15px] leading-relaxed text-[var(--ret-text-dim)] md:text-[17px]">
								{description}
							</p>
							{actions ? <div className="mt-8 flex flex-wrap gap-3">{actions}</div> : null}
						</div>
					</div>
					{aside ? (
						<div
							className="ret-page-enter min-w-0 border-t border-[var(--ret-border)] bg-[var(--ret-bg-soft)] lg:border-l lg:border-t-0"
							style={{ "--item-index": 2 } as CSSProperties}
						>
							{aside}
						</div>
					) : null}
				</div>
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
						"ret-page-enter grid min-h-[126px] grid-rows-[auto_1fr] p-4 tabular-nums md:p-5",
						index > 0 ? "border-t border-[var(--ret-border)] md:border-l md:border-t-0" : null,
					)}
					style={{ "--item-index": index } as CSSProperties}
				>
					<div
						className="flex items-center justify-between gap-3 border-b border-[var(--ret-border)] pb-3"
					>
						<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							{metric.label}
						</p>
						<Circle className="h-3 w-3 text-[var(--ret-text-muted)]" strokeWidth={1.5} />
					</div>
					<div className="pt-4">
						<p className="font-mono text-[28px] leading-none text-[var(--ret-text)]">
							{metric.value}
						</p>
						<p className="mt-3 text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
							{metric.detail}
						</p>
					</div>
				</div>
			))}
		</div>
	);
}

export function FlowSteps({ steps }: { steps: ReadonlyArray<MarketingStep> }) {
	return (
		<div className="border border-[var(--ret-border)] bg-[var(--ret-bg)]">
			{steps.map((step, index) => (
				<div
					key={step.label}
					className="ret-page-enter grid grid-cols-[48px_minmax(0,1fr)] items-stretch border-b border-[var(--ret-border)] last:border-b-0 md:grid-cols-[56px_minmax(0,160px)_minmax(0,1fr)]"
					style={{ "--item-index": index } as CSSProperties}
				>
					<div className="flex items-center justify-center border-r border-[var(--ret-border)]">
						<CheckCircle2 className="h-4 w-4 text-[var(--ret-text-dim)]" strokeWidth={1.5} />
					</div>
					<div className="flex min-h-16 items-center px-4 md:border-r md:border-[var(--ret-border)]">
						<div>
							<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								{String(index + 1).padStart(2, "0")}
							</p>
							<h3 className="mt-1 text-[14px] font-semibold text-[var(--ret-text)]">
								{step.label}
							</h3>
						</div>
					</div>
					<p className="col-span-2 flex items-center border-t border-[var(--ret-border)] px-4 py-4 text-[13px] leading-relaxed text-[var(--ret-text-dim)] md:col-span-1 md:border-t-0">
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
		<div className={cn("border border-[var(--ret-border)] bg-[var(--ret-bg)]", className)}>
			<div className="flex items-center justify-between border-b border-[var(--ret-border)] px-4 py-3">
				<span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					<TerminalIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
					{title}
				</span>
				<span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
					trace
				</span>
			</div>
			<div className="font-mono text-[12px] text-[var(--ret-text-dim)]">
				{lines.map((line, index) => (
					<div
						key={line}
						className="grid grid-cols-[48px_minmax(0,1fr)] border-b border-[var(--ret-border)] last:border-b-0"
					>
						<span className="border-r border-[var(--ret-border)] px-3 py-2 text-[10px] text-[var(--ret-text-muted)]">
							{String(index + 1).padStart(2, "0")}
						</span>
						<span className="truncate px-3 py-2">{line}</span>
					</div>
				))}
			</div>
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
			className="ret-interactive-card ret-pressable group grid min-h-[142px] border border-[var(--ret-border)] bg-[var(--ret-bg)] transition-colors hover:border-[var(--ret-border-hover)] hover:bg-[var(--ret-surface)]"
		>
			<div className="grid grid-cols-[56px_minmax(0,1fr)] border-b border-[var(--ret-border)]">
				<span className="ret-card-icon flex h-14 w-14 items-center justify-center border-r border-[var(--ret-border)] bg-[var(--ret-bg-soft)] text-[var(--ret-text-muted)] group-hover:text-[var(--ret-text)]">
					<PublicIcon name={icon} className="h-[18px] w-[18px]" />
				</span>
				<div className="flex items-center justify-between gap-3 px-4">
					<h2 className="text-[16px] font-semibold tracking-tight text-[var(--ret-text)]">
						{title}
					</h2>
					<ArrowRight className="ret-card-arrow h-4 w-4 shrink-0 text-[var(--ret-text-muted)] group-hover:text-[var(--ret-text)]" strokeWidth={1.5} />
				</div>
			</div>
			<div className="p-4">
				<p className="text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
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
		<ReticleSection contentClassName="px-5 py-10 md:px-6 md:py-12">
			<div className="mb-6 border border-[var(--ret-border)] bg-[var(--ret-bg)] px-4 py-4 md:px-5">
				<div className="ret-page-enter" style={{ "--item-index": 0 } as CSSProperties}>
					<ReticleLabel>{label}</ReticleLabel>
					<h2 className="ret-display mt-2 text-[24px] leading-[1.05] text-[var(--ret-text)] md:text-[32px]">
						{title}
					</h2>
				</div>
			</div>
			{children}
		</ReticleSection>
	);
}

export { ReticleSpacer };
