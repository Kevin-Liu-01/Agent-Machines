import Image from "next/image";

import { SignedIn, SignedOut } from "@/components/AuthSwitch";
import { ContributionGrid } from "@/components/ContributionGrid";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";

export function HeroBlock() {
	return (
		<div className="relative grid items-stretch gap-8 md:grid-cols-[1fr_1.1fr] md:gap-10">
			{/*
			  Faint wing watermark anchored to the top-right of the hero.
			  Sits behind everything via z-0 / pointer-events-none. The
			  wing is the brand mark; using it as ambient wallpaper here
			  (instead of a tiny corner logo) makes the hero feel weighted
			  to the brand without needing literal wordmarks.
			*/}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -top-8 right-[-4%] hidden h-[420px] w-[420px] opacity-[0.07] md:block dark:opacity-[0.10]"
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
					<ReticleBadge variant="accent">v0.2 multi-agent</ReticleBadge>
					<ReticleBadge>hermes . openclaw</ReticleBadge>
				</div>
				<h1 className="ret-display mt-4 text-3xl md:text-[44px]">
					An agent's loadout,
					<br />
					<span className="text-[var(--ret-text-dim)]">
						in one machine.
					</span>
				</h1>
				<p className="mt-4 max-w-[58ch] text-[13px] leading-relaxed text-[var(--ret-text-dim)] md:text-sm">
					A rig with everything wired in:{" "}
					<strong className="text-[var(--ret-text)]">23 built-in tools</strong>{" "}
					(shell, browser, vision, cron, memory),{" "}
					<strong className="text-[var(--ret-text)]">95 SKILL.md files</strong>{" "}
					that auto-load by intent,{" "}
					<strong className="text-[var(--ret-text)]">17 services</strong>{" "}
					ranked by interface (Vercel, Stripe, Supabase, Linear, ...), and
					Cursor SDK delegation
					through{" "}
					<code className="border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1 font-mono text-[0.85em]">
						.cursor/rules
					</code>
					. Pick Hermes or OpenClaw; plug in any provider key.
				</p>
				<div className="mt-5 flex flex-wrap gap-2">
					<SignedIn>
						<ReticleButton as="a" href="/dashboard" variant="primary" size="sm">
							Open dashboard
						</ReticleButton>
					</SignedIn>
					<SignedOut>
						<ReticleButton as="a" href="/sign-in" variant="primary" size="sm">
							Sign in to chat
						</ReticleButton>
					</SignedOut>
					<ReticleButton
						as="a"
						href="https://github.com/Kevin-Liu-01/agent-machines"
						target="_blank"
						variant="secondary"
						size="sm"
					>
						View on GitHub
					</ReticleButton>
					<ReticleButton
						as="a"
						href="https://github.com/NousResearch/hermes-agent"
						target="_blank"
						variant="ghost"
						size="sm"
					>
						Hermes docs
					</ReticleButton>
				</div>
				<p className="mt-5 max-w-[60ch] font-mono text-[11px] text-[var(--ret-text-muted)]">
					{"->"} every cell on the right is one day in this rig's life. hover
					to see what fired, click to pin. dedalus boots, an agent serves,
					cursor codes, the rig itself reloads skills from github.
				</p>
			</div>

			<div className="relative z-10 min-h-[280px]">
				<ContributionGrid />
			</div>
		</div>
	);
}
