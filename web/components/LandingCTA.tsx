import { SignedIn, SignedOut } from "@/components/AuthSwitch";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ToolIcon } from "@/components/ToolIcon";
import { WingBackground } from "@/components/WingBackground";
import type { ToolCategory } from "@/lib/dashboard/loadout";

/**
 * Section that replaces the public chat box. Chat moved into the
 * dashboard behind Clerk auth, so the landing surfaces a CTA that
 * adapts based on session state instead.
 */
export function LandingCTA() {
	return (
		<div className="relative overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-bg)] p-6 md:p-9">
			<WingBackground variant="nyx-waves" opacity={{ light: 0.4, dark: 0.3 }} />
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
					<ul className="mt-2 space-y-1">
						{(
							[
								{ icon: "memory", label: "chat history (.jsonl)" },
								{ icon: "image", label: "uploaded artifacts" },
								{ icon: "memory", label: "USER.md . MEMORY.md" },
								{ icon: "search", label: "FTS5 sessions DB" },
								{ icon: "schedule", label: "cron schedules" },
								{ icon: "code", label: "python venv + skills" },
							] satisfies ReadonlyArray<{ icon: ToolCategory; label: string }>
						).map((row) => (
							<li
								key={row.label}
								className="flex items-center gap-2"
							>
								<ToolIcon
									name={row.icon}
									size={11}
									className="text-[var(--ret-purple)]"
								/>
								<span>{row.label}</span>
							</li>
						))}
					</ul>
				</div>
			</div>
		</div>
	);
}
