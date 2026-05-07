import { SignedIn, SignedOut } from "@/components/AuthSwitch";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";

/**
 * Section that replaces the public chat box. Chat moved into the
 * dashboard behind Clerk auth, so the landing surfaces a CTA that
 * adapts based on session state instead.
 */
export function LandingCTA() {
	return (
		<div className="rounded-[var(--ret-card-radius)] border border-[var(--ret-border)] bg-[var(--ret-bg)] p-6 md:p-9">
			<div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
				<div>
					<ReticleLabel>CHAT -- AUTH-GATED</ReticleLabel>
					<h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
						Talk to it from the dashboard
					</h2>
					<p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-[var(--ret-text-dim)] md:text-base">
						The chat surface streams from{" "}
						<code className="rounded border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1 font-mono text-[0.85em]">
							/v1/chat/completions
						</code>{" "}
						on the deployed machine. Tools fire on the VM. Memory persists
						across sessions. Access is allowlisted -- bring an authorized email.
					</p>
					<div className="mt-6 flex flex-wrap gap-3">
						<SignedIn>
							<ReticleButton as="a" href="/dashboard/chat" variant="primary">
								Open chat
							</ReticleButton>
							<ReticleButton as="a" href="/dashboard" variant="secondary">
								Dashboard overview
							</ReticleButton>
						</SignedIn>
						<SignedOut>
							<ReticleButton as="a" href="/sign-in" variant="primary">
								Sign in
							</ReticleButton>
							<ReticleButton
								as="a"
								href="https://github.com/Kevin-Liu-01/hermes-machines"
								target="_blank"
								variant="secondary"
							>
								What's inside
							</ReticleButton>
						</SignedOut>
					</div>
				</div>

				<div className="rounded-md border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-5 font-mono text-[12px] leading-relaxed text-[var(--ret-text-dim)]">
					<p className="text-[var(--ret-text-muted)]">{"# what you get"}</p>
					<p className="mt-2">
						<span className="text-[var(--ret-purple)]">$</span> 13 bundled skills
					</p>
					<p>
						<span className="text-[var(--ret-purple)]">$</span> 2 MCP servers . 10 tools
					</p>
					<p>
						<span className="text-[var(--ret-purple)]">$</span> 4 cron automations
					</p>
					<p>
						<span className="text-[var(--ret-purple)]">$</span> Cursor SDK delegation
					</p>
					<p>
						<span className="text-[var(--ret-purple)]">$</span> Live machine state
					</p>
				</div>
			</div>
		</div>
	);
}
