import { SignedIn, SignedOut } from "@/components/AuthSwitch";
import { ContributionGrid } from "@/components/ContributionGrid";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";

export function HeroBlock() {
	return (
		<div className="grid items-stretch gap-8 md:grid-cols-[1fr_1.1fr] md:gap-10">
			<div className="flex flex-col">
				<div className="flex flex-wrap items-center gap-2">
					<ReticleLabel>AGENT MACHINES</ReticleLabel>
					<ReticleBadge variant="accent">v0.2 multi-agent</ReticleBadge>
					<ReticleBadge>hermes . openclaw</ReticleBadge>
				</div>
				<h1 className="ret-display mt-4 text-3xl md:text-[44px]">
					Bring any agent
					<br />
					<span className="text-[var(--ret-text-dim)]">
						to any provider.
					</span>
				</h1>
				<p className="mt-4 max-w-[58ch] text-[13px] leading-relaxed text-[var(--ret-text-dim)] md:text-sm">
					Pick <strong className="text-[var(--ret-text)]">Hermes</strong>{" "}
					(Nous Research) or{" "}
					<strong className="text-[var(--ret-text)]">OpenClaw</strong>{" "}
					(Dedalus). Plug in a Dedalus, Vercel Sandbox, or Fly key. Per-user
					fleets, persistent chats and artifacts on Vercel Blob, and Cursor
					SDK delegation wired in as{" "}
					<code className="border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1 font-mono text-[0.85em]">
						.cursor/rules
					</code>
					.
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
						href="https://github.com/Kevin-Liu-01/hermes-machines"
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

			<div className="min-h-[280px]">
				<ContributionGrid />
			</div>
		</div>
	);
}
