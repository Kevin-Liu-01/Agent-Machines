"use client";

import Image from "next/image";
import { useState, type SVGProps } from "react";

import { SignedIn, SignedOut } from "@/components/AuthSwitch";
import { ContributionGrid } from "@/components/ContributionGrid";
import {
	HeroAgentPortrait,
	HERO_AGENTS,
	type HeroAgent,
} from "@/components/HeroAgentPortrait";
import { Logo } from "@/components/Logo";
import { ServiceIcon } from "@/components/ServiceIcon";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { AGENTS } from "@/lib/agents";

const AGENT_CAPABILITIES: Record<HeroAgent, string> = {
	hermes: "memory . cron . sessions . MCP-native",
	openclaw: "computer use . browser . shell . vision",
	"claude-code": "agentic coding . file edit . shell . SDK",
	codex: "agentic coding . sandbox . exec mode",
};


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
		setAgent((cur) => {
			const idx = HERO_AGENTS.indexOf(cur);
			return HERO_AGENTS[(idx + 1) % HERO_AGENTS.length];
		});
	}

	return (
		<div className="relative grid items-stretch gap-px overflow-hidden bg-[var(--ret-border)] md:grid-cols-[0.88fr_1.12fr]">
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

			<div className="relative z-10 flex flex-col justify-between bg-[var(--ret-bg)] p-5 md:p-7">
				<div>
					<div className="flex flex-wrap items-center gap-2">
						<ReticleLabel>AGENT MACHINES</ReticleLabel>
						<ReticleBadge variant="accent">stateful microVM</ReticleBadge>
						<ReticleBadge>per-account fleet</ReticleBadge>
					</div>

					<div className="mt-6 flex items-stretch gap-4 md:gap-5">
						<HeroAgentPortrait agent={agent} onToggle={toggleAgent} />
						<h1 className="ret-display text-3xl leading-[1.05] md:text-[40px]">
							<span className="block whitespace-nowrap">
								Persistent Machines
							</span>
							<span className="block whitespace-nowrap text-[var(--ret-text-dim)]">
								for your Agent
							</span>
						</h1>
					</div>

					<p className="mt-6 max-w-[56ch] text-[15px] leading-relaxed text-[var(--ret-text-dim)]">
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
				</div>

				<div className="mt-8 flex flex-wrap items-center gap-2">
					<SignedIn>
						<ReticleButton
							as="a"
							href="/dashboard"
							variant="primary"
							size="md"
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
							size="md"
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
					{AGENTS.map((a) => (
						<ReticleButton
							key={a.id}
							as="a"
							href={a.githubUrl}
							target="_blank"
							variant="ghost"
							size="sm"
						>
							<Logo mark={a.logoMark} size={13} />
							{a.name}
						</ReticleButton>
					))}
				</div>

				{/* Hatch fill: fills remaining vertical space below CTAs */}
				<div
					className="mt-4 min-h-[16px] flex-1"
					style={{ backgroundImage: "repeating-linear-gradient(135deg, var(--ret-rail) 0 1px, transparent 1px 5px)" }}
					aria-hidden="true"
				/>
			</div>

			<div className="relative z-10 flex min-h-[280px] flex-col bg-[var(--ret-bg)]">
				<ContributionGrid />
			</div>
		</div>
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
