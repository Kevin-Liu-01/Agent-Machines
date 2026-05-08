"use client";

import Image from "next/image";
import { useState, type SVGProps } from "react";

import { SignedIn, SignedOut } from "@/components/AuthSwitch";
import { ContributionGrid } from "@/components/ContributionGrid";
import {
	HeroAgentPortrait,
	type HeroAgent,
} from "@/components/HeroAgentPortrait";
import { Logo } from "@/components/Logo";
import { ServiceIcon } from "@/components/ServiceIcon";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";

const AGENT_TAGLINE: Record<HeroAgent, { label: string; capabilities: string }> =
	{
		hermes: {
			label: "Hermes",
			capabilities: "memory . cron . sessions . MCP-native",
		},
		openclaw: {
			label: "OpenClaw",
			capabilities: "computer use . browser . shell . vision",
		},
	};

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
	// Hero-only preview state: which agent the portrait is showing
	// right now. Independent of the user's actual configured agent
	// (that lives in Clerk metadata + the dashboard). Clicking the
	// portrait toggles between Hermes (default) and OpenClaw
	// (preview); the subheader tagline below the heading swaps in
	// lockstep so the relationship between the wireframe identity
	// and the capability line is unambiguous.
	const [agent, setAgent] = useState<HeroAgent>("hermes");
	const tagline = AGENT_TAGLINE[agent];
	function toggleAgent() {
		setAgent((cur) => (cur === "hermes" ? "openclaw" : "hermes"));
	}

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
					<HeroAgentPortrait agent={agent} onToggle={toggleAgent} />
					<h1 className="ret-display text-3xl leading-[1.05] md:text-[44px]">
						A persistent machine
						<br />
						<span className="text-[var(--ret-text-dim)]">
							for your agent.
						</span>
					</h1>
				</div>

				<p className="mt-5 max-w-[55ch] text-[14px] leading-relaxed text-[var(--ret-text-dim)]">
					One stateful microVM per account.{" "}
					<strong className="text-[var(--ret-text)]">
						Boot in 30 seconds, sleep on idle, wake on the first prompt.
					</strong>
				</p>

				{/*
				  Active-agent tagline. Bound to the portrait's preview
				  state -- click the wireframe and this line swaps in
				  the same beat. The agent label is the anchor, the
				  capability list is the payoff. `aria-live="polite"`
				  so screen readers announce the change without
				  interrupting whatever else they're reading.
				*/}
				<p
					aria-live="polite"
					className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]"
				>
					<span className="inline-flex items-center gap-1.5 text-[var(--ret-text)]">
						<Logo
							mark={agent === "hermes" ? "nous" : "openclaw"}
							size={11}
						/>
						{tagline.label}
					</span>
					<span className="text-[var(--ret-text-dim)]">
						{tagline.capabilities}
					</span>
					<span className="text-[var(--ret-purple)]/80">
						{"->"} click portrait to swap
					</span>
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

			</div>

			<div className="relative z-10 flex min-h-[280px] flex-col">
				<ContributionGrid />
			</div>
		</div>
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
