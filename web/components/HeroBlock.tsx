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

// Capability suffix appended to the subheader; swaps when the
// portrait toggles between Hermes (default) and OpenClaw (preview).
const AGENT_CAPABILITIES: Record<HeroAgent, string> = {
	hermes: "memory . cron . sessions . MCP-native",
	openclaw: "computer use . browser . shell . vision",
};

const PROOF_POINTS: ReadonlyArray<{
	Icon: (p: SVGProps<SVGSVGElement>) => React.ReactElement;
	title: string;
	body: string;
}> = [
	{
		Icon: IconDisk,
		title: "State on disk, not in RAM",
		body: "Chats, files, memory, sessions, crons -- all in /home/machine. Survives every sleep.",
	},
	{
		Icon: IconKey,
		title: "Per-account fleet",
		body: "One Clerk sign-in. Same machine on every device. Keys + agent choice in private metadata.",
	},
	{
		Icon: IconStack,
		title: "Bring any agent + tool",
		body: "Hermes or OpenClaw. 96 skills, 23 built-ins, 17 services. Dedalus live; Sandbox + Fly shaped.",
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
	const capabilities = AGENT_CAPABILITIES[agent];
	function toggleAgent() {
		setAgent((cur) => (cur === "hermes" ? "openclaw" : "hermes"));
	}

	return (
		<div className="relative grid items-stretch gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] md:grid-cols-[0.88fr_1.12fr]">
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

			<div className="relative z-10 flex flex-col bg-[var(--ret-bg)] p-4 md:p-5">
				<div className="flex flex-wrap items-center gap-2">
					<ReticleLabel>AGENT MACHINES</ReticleLabel>
					<ReticleBadge variant="accent">stateful microVM</ReticleBadge>
					<ReticleBadge>per-account fleet</ReticleBadge>
				</div>

				{/*
				  Items-stretch + aspect-square + self-stretch makes the
				  portrait's height equal the heading's natural height
				  exactly, no magic numbers. Width is derived from the
				  square ratio.
				
				  Each line of the heading is its own block + whitespace-
				  nowrap so "Persistent Machines" can't break across two
				  lines just because the column is narrow. md:text-[36px]
				  is the largest size where "Persistent Machines" fits on
				  one line in the available column area; bumping back up
				  to text-[44px] makes the heading wrap to 4 lines and
				  drags the portrait with it.
				*/}
				<div className="mt-4 flex items-stretch gap-4 md:gap-5">
					<HeroAgentPortrait agent={agent} onToggle={toggleAgent} />
					<h1 className="ret-display text-3xl leading-[1.05] md:text-[36px]">
						<span className="block whitespace-nowrap">
							Persistent Machines
						</span>
						<span className="block whitespace-nowrap text-[var(--ret-text-dim)]">
							for your Agent
						</span>
					</h1>
				</div>

				{/*
				  Subheader is one paragraph: the static promise + the
				  dynamic capability suffix. Click the wireframe and the
				  trailing capability list swaps without moving any
				  layout. `aria-live="polite"` so screen readers
				  announce the change without interrupting other
				  content.
				*/}
				<p className="mt-4 max-w-[60ch] text-[14px] leading-relaxed text-[var(--ret-text-dim)]">
					One stateful microVM per account.{" "}
					<strong className="text-[var(--ret-text)]">
						Boot in 30 seconds, sleep on idle, wake on the first prompt.
					</strong>{" "}
					<span
						aria-live="polite"
						className="font-mono text-[12px] tracking-tight text-[var(--ret-text-muted)]"
					>
						{capabilities}.
					</span>
				</p>

				<ul className="mt-4 flex flex-col divide-y divide-[var(--ret-border)] border-y border-[var(--ret-border)]">
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

				<div className="mt-5 flex flex-wrap gap-2">
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

			<div className="relative z-10 flex min-h-[280px] flex-col bg-[var(--ret-bg)]">
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
