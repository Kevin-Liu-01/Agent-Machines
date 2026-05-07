import { SignedIn, SignedOut } from "@/components/AuthSwitch";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { HermesBustScene } from "@/components/three";

export function HeroBlock() {
	return (
		<div className="grid items-stretch gap-10 md:grid-cols-[1.35fr_1fr] md:gap-12">
			<div className="flex flex-col justify-center">
				<div className="flex flex-wrap items-center gap-2">
					<ReticleLabel>HERMES MACHINES</ReticleLabel>
					<ReticleBadge variant="accent">v0.1</ReticleBadge>
					<ReticleBadge>dedalus + cursor sdk</ReticleBadge>
				</div>
				<h1 className="mt-5 text-5xl font-semibold leading-[1.02] tracking-tight md:text-[64px]">
					An agent
					<br />
					with a body
					<br />
					<span className="text-[var(--ret-text-dim)]">
						that writes its own code.
					</span>
				</h1>
				<p className="mt-6 max-w-[58ch] text-base leading-relaxed text-[var(--ret-text-dim)] md:text-lg">
					Hermes Agent on a Dedalus microVM. Shell, browser, file access,
					scheduled crons, a bundled skill library -- and when you ask for real
					code, it spawns a Cursor agent with the rig's skills wired in as{" "}
					<code className="rounded border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1 font-mono text-[0.85em]">
						.cursor/rules
					</code>
					.
				</p>
				<div className="mt-8 flex flex-wrap gap-3">
					<SignedIn>
						<ReticleButton as="a" href="/dashboard" variant="primary">
							Open dashboard
						</ReticleButton>
					</SignedIn>
					<SignedOut>
						<ReticleButton as="a" href="/sign-in" variant="primary">
							Sign in to chat
						</ReticleButton>
					</SignedOut>
					<ReticleButton
						as="a"
						href="https://github.com/Kevin-Liu-01/hermes-machines"
						target="_blank"
						variant="secondary"
					>
						View on GitHub
					</ReticleButton>
					<ReticleButton
						as="a"
						href="https://github.com/NousResearch/hermes-agent"
						target="_blank"
						variant="ghost"
					>
						Hermes docs
					</ReticleButton>
				</div>
			</div>

			<HermesBustScene className="aspect-square h-full max-h-[520px] min-h-[420px] w-full rounded-[var(--ret-card-radius)] border border-[var(--ret-border)] md:aspect-auto" />
		</div>
	);
}
