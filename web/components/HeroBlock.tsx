import Image from "next/image";
import dynamic from "next/dynamic";
import type { SVGProps } from "react";

import { SignedIn, SignedOut } from "@/components/AuthSwitch";
import { ContributionGrid } from "@/components/ContributionGrid";
import { Logo } from "@/components/Logo";
import { ServiceIcon } from "@/components/ServiceIcon";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";

/**
 * Hero-side 3D bust portrait. Rendered client-side via the same
 * SceneCanvas the dashboard's IDENTITY card uses, so the marketing
 * page and the in-product card share visual language.
 */
const HermesBustScene = dynamic(
	() => import("@/components/three").then((m) => m.HermesBustScene),
	{ ssr: false, loading: () => null },
);

const PROOF_POINTS: ReadonlyArray<{
	Icon: (p: SVGProps<SVGSVGElement>) => React.ReactElement;
	title: string;
	body: string;
}> = [
	{
		Icon: IconDisk,
		title: "State on disk, not in RAM",
		body: "Chats, files, USER.md, MEMORY.md, FTS5 sessions, cron, venv -- everything lives at /home/machine and survives every sleep.",
	},
	{
		Icon: IconKey,
		title: "Per-account fleet",
		body: "Sign in once with Clerk; the same machine wakes on every device. Provider keys + agent choice persist in private metadata.",
	},
	{
		Icon: IconStack,
		title: "Bring any agent + tool",
		body: "Hermes or OpenClaw, 95 skills, 23 built-ins, and 17 service routes. Dedalus runs today; Sandbox and Fly are shaped in the provider layer.",
	},
];

export function HeroBlock() {
	return (
		<div className="relative grid items-stretch gap-10 md:grid-cols-[1fr_1.05fr] md:gap-12">
			{/*
			  Faint wing watermark anchored to the top-right of the hero.
			  Sits behind everything via z-0 / pointer-events-none -- the
			  wing as ambient wallpaper instead of a literal wordmark.
			*/}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -top-8 right-[-4%] hidden h-[420px] w-[420px] opacity-[0.06] md:block dark:opacity-[0.10]"
			>
				<Image
					src="/brand/wing-mark.png"
					alt=""
					fill
					sizes="420px"
					className="object-contain object-right-top dark:hidden"
				/>
				<Image
					src="/brand/wing-mark-dark.png"
					alt=""
					fill
					sizes="420px"
					className="hidden object-contain object-right-top dark:block"
				/>
			</div>

			<div className="relative z-10 flex flex-col">
				<div className="flex flex-wrap items-center gap-2">
					<ReticleLabel>AGENT MACHINES</ReticleLabel>
					<ReticleBadge variant="accent">stateful microVM</ReticleBadge>
					<ReticleBadge>per-account fleet</ReticleBadge>
				</div>

				<div className="mt-5 flex items-start gap-5 md:gap-7">
					<h1 className="ret-display text-3xl leading-[1.05] md:text-[44px]">
						A persistent machine
						<br />
						<span className="text-[var(--ret-text-dim)]">
							for your agent.
						</span>
					</h1>
					<AgentPortrait />
				</div>

				<p className="mt-5 max-w-[55ch] text-[14px] leading-relaxed text-[var(--ret-text-dim)]">
					One stateful microVM per account.{" "}
					<strong className="text-[var(--ret-text)]">
						Boot in 30 seconds, sleep on idle, wake on the first prompt.
					</strong>
				</p>

				<ul className="mt-5 flex flex-col divide-y divide-[var(--ret-border)] border-y border-[var(--ret-border)]">
					{PROOF_POINTS.map(({ Icon, title, body }) => (
						<li key={title} className="flex items-start gap-3 py-3">
							<span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] text-[var(--ret-purple)]">
								<Icon className="h-3.5 w-3.5" />
							</span>
							<div className="min-w-0 flex-1">
								<p className="text-[13px] font-semibold tracking-tight text-[var(--ret-text)]">
									{title}
								</p>
								<p className="mt-0.5 text-[12px] leading-snug text-[var(--ret-text-dim)]">
									{body}
								</p>
							</div>
						</li>
					))}
				</ul>

				<div className="mt-6 flex flex-wrap gap-2">
					<SignedIn>
						<ReticleButton
							as="a"
							href="/dashboard"
							variant="primary"
							size="sm"
						>
							<IconArrowRight className="h-3.5 w-3.5" />
							Open dashboard
						</ReticleButton>
					</SignedIn>
					<SignedOut>
						<ReticleButton
							as="a"
							href="/sign-in"
							variant="primary"
							size="sm"
						>
							<IconLock className="h-3.5 w-3.5" />
							Sign in
						</ReticleButton>
					</SignedOut>
					<ReticleButton
						as="a"
						href="https://github.com/Kevin-Liu-01/agent-machines"
						target="_blank"
						variant="secondary"
						size="sm"
					>
						<ServiceIcon slug="github" size={13} tone="mono" />
						GitHub
					</ReticleButton>
					<ReticleButton
						as="a"
						href="https://github.com/NousResearch/hermes-agent"
						target="_blank"
						variant="ghost"
						size="sm"
					>
						<Logo mark="nous" size={13} />
						Docs
					</ReticleButton>
					<ReticleButton
						as="a"
						href="https://github.com/openclaw/openclaw"
						target="_blank"
						variant="ghost"
						size="sm"
					>
						<Logo mark="openclaw" size={13} />
						Docs
					</ReticleButton>
				</div>

				<p className="mt-6 flex items-start gap-2 max-w-[55ch] font-mono text-[11px] leading-relaxed text-[var(--ret-text-muted)]">
					<span className="mt-0.5 text-[var(--ret-purple)]">{"->"}</span>
					<span>
						Each cell on the right is one day this machine was awake. Hover
						to peek, click to pin. Nothing lives in RAM that it can't rebuild
						from <code className="text-[var(--ret-text-dim)]">/home/machine</code>.
					</span>
				</p>
			</div>

			<div className="relative z-10 min-h-[280px]">
				<ContributionGrid />
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Agent portrait -- mirrors the dashboard IDENTITY card               */
/* ------------------------------------------------------------------ */

function AgentPortrait() {
	return (
		<aside className="relative hidden shrink-0 lg:block">
			<div className="relative aspect-square w-[156px] border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]">
				<HermesBustScene className="h-full w-full" />
				{/* Cross marks on the four corners pin the canvas into the
				    Reticle grid -- same treatment as the dashboard
				    IDENTITY card. */}
				<span className="pointer-events-none absolute left-1.5 top-1.5 h-2.5 w-2.5 border-l border-t border-[var(--ret-cross)]" />
				<span className="pointer-events-none absolute right-1.5 top-1.5 h-2.5 w-2.5 border-r border-t border-[var(--ret-cross)]" />
				<span className="pointer-events-none absolute bottom-1.5 left-1.5 h-2.5 w-2.5 border-b border-l border-[var(--ret-cross)]" />
				<span className="pointer-events-none absolute bottom-1.5 right-1.5 h-2.5 w-2.5 border-b border-r border-[var(--ret-cross)]" />
				<span className="pointer-events-none absolute right-1.5 top-1.5 z-10 border border-[var(--ret-green)]/45 bg-[var(--ret-green)]/10 px-1 py-px font-mono text-[8px] uppercase tracking-[0.22em] text-[var(--ret-green)]">
					default
				</span>
			</div>
			<div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
				<Logo mark="nous" size={10} />
				<span className="text-[var(--ret-text-dim)]">Hermes</span>
				<span className="text-[var(--ret-text-muted)]">. by Nous Research</span>
			</div>
			<p className="font-mono text-[10px] tracking-wide text-[var(--ret-text-muted)]">
				swap to OpenClaw any time
			</p>
		</aside>
	);
}

/* ------------------------------------------------------------------ */
/* Inline proof-point + button icons (Lucide-shaped, currentColor)     */
/* ------------------------------------------------------------------ */

function IconDisk(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<ellipse cx="8" cy="4" rx="6" ry="2" />
			<path d="M2 4v8c0 1.1 2.7 2 6 2s6-.9 6-2V4" />
			<path d="M2 8c0 1.1 2.7 2 6 2s6-.9 6-2" />
		</svg>
	);
}

function IconKey(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<circle cx="5" cy="11" r="2.5" />
			<path d="M7 9l6.5-6.5M11 5l1.5 1.5M9.5 6.5L11 8" />
		</svg>
	);
}

function IconStack(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M8 2L2 5l6 3 6-3z" />
			<path d="M2 11l6 3 6-3M2 8l6 3 6-3" />
		</svg>
	);
}

function IconArrowRight(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M3 8h10M9 4l4 4-4 4" />
		</svg>
	);
}

function IconLock(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<rect x="3" y="7" width="10" height="7" />
			<path d="M5 7V5a3 3 0 0 1 6 0v2" />
		</svg>
	);
}
