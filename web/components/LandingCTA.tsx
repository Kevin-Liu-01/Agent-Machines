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
		<div className="relative overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-bg)] p-6 md:p-9">
			{/* Subtle nyx-waves pattern from the Dedalus brand kit. Sits at very
			    low opacity behind the content so the signature Dedalus-feel is
			    present without competing with the CTAs. */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat opacity-[0.05] mix-blend-luminosity dark:opacity-[0.08]"
				style={{ backgroundImage: "url(/brand/bg-nyx-waves.png)" }}
			/>
			<div className="relative grid gap-6 md:grid-cols-[1.4fr_1fr]">
				<div>
					<ReticleLabel>FLEET -- AUTH-GATED</ReticleLabel>
					<h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
						Sign in. See your machines.
					</h2>
					<p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-[var(--ret-text-dim)] md:text-base">
						Clerk session in, fleet out. Each user's{" "}
						<code className="border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1 font-mono text-[0.85em]">
							UserConfig
						</code>{" "}
						-- attached provider keys, machine fleet, active machine, draft
						agent -- lives in Clerk private metadata. Wake any machine; chat
						history, files, and learned skills stream in from{" "}
						<code className="border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1 font-mono text-[0.85em]">
							/home/machine
						</code>
						. Same machine, every device.
					</p>
					<div className="mt-6 flex flex-wrap gap-3">
						<SignedIn>
							<ReticleButton as="a" href="/dashboard/machines" variant="primary">
								See my fleet
							</ReticleButton>
							<ReticleButton as="a" href="/dashboard/chat" variant="secondary">
								Open chat
							</ReticleButton>
						</SignedIn>
						<SignedOut>
							<ReticleButton as="a" href="/sign-in" variant="primary">
								Sign in to provision
							</ReticleButton>
							<ReticleButton
								as="a"
								href="https://github.com/Kevin-Liu-01/agent-machines"
								target="_blank"
								variant="secondary"
							>
								What's inside
							</ReticleButton>
						</SignedOut>
					</div>
				</div>

				<div className="border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-5 font-mono text-[12px] leading-relaxed text-[var(--ret-text-dim)]">
					<p className="text-[var(--ret-text-muted)]">{"# stays on the machine"}</p>
					<p className="mt-2">
						<span className="text-[var(--ret-purple)]">$</span> chat history (.jsonl)
					</p>
					<p>
						<span className="text-[var(--ret-purple)]">$</span> uploaded artifacts
					</p>
					<p>
						<span className="text-[var(--ret-purple)]">$</span> USER.md . MEMORY.md
					</p>
					<p>
						<span className="text-[var(--ret-purple)]">$</span> FTS5 sessions DB
					</p>
					<p>
						<span className="text-[var(--ret-purple)]">$</span> cron schedules
					</p>
					<p>
						<span className="text-[var(--ret-purple)]">$</span> python venv + skills
					</p>
				</div>
			</div>
		</div>
	);
}
