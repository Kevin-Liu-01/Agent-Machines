import { Logo } from "@/components/Logo";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";

type StackEntry = {
	mark: "dedalus" | "agent" | "cursor";
	name: string;
	role: string;
	tag: string;
} & (
	| { href: string; links?: never }
	| {
			href?: never;
			/** Multiple sub-links rendered as a row of small "name ->"
			 *  anchors. Used for the agent layer where both Hermes and
			 *  OpenClaw deserve attribution. */
			links: ReadonlyArray<{ label: string; href: string }>;
	  }
);

const STACK: ReadonlyArray<StackEntry> = [
	{
		mark: "dedalus",
		name: "Dedalus Machines",
		role: "the runtime layer",
		href: "https://docs.dedaluslabs.ai/dcs",
		tag: "microVM + gateway",
	},
	{
		mark: "agent",
		name: "Hermes / OpenClaw",
		role: "the agent layer",
		tag: "swap in the navbar",
		links: [
			{ label: "Hermes", href: "https://github.com/NousResearch/hermes-agent" },
			{ label: "OpenClaw", href: "https://github.com/openclaw/openclaw" },
		],
	},
	{
		mark: "cursor",
		name: "Cursor SDK",
		role: "the codework layer",
		href: "https://cursor.com/docs/sdk/typescript",
		tag: "spawned via MCP",
	},
];

/**
 * Three-up attribution row that names the partners who actually do the
 * work. Sits between the hero and the chat CTA so a visitor's first
 * structural read is "what's this built on" -- the answer is three logos,
 * three roles, three sentences.
 */
export function StackRow() {
	return (
		<div className="mt-12">
			<ReticleLabel>STACK</ReticleLabel>
			<div className="mt-4 grid grid-cols-1 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] md:grid-cols-3">
				{STACK.map((s) => {
					const inner = (
						<>
							<div className="flex items-center justify-between">
								<Logo mark={s.mark} size={28} />
								<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
									{s.tag}
								</span>
							</div>
							<div>
								<p className="text-base font-semibold tracking-tight text-[var(--ret-text)] group-hover:text-[var(--ret-purple)]">
									{s.name}
								</p>
								<p className="mt-1 font-mono text-[12px] text-[var(--ret-text-dim)]">
									{s.role}
								</p>
								{s.links ? (
									<div className="mt-3 flex flex-wrap gap-2">
										{s.links.map((l) => (
											<a
												key={l.href}
												href={l.href}
												target="_blank"
												rel="noreferrer"
												className="inline-flex items-center gap-1 border border-[var(--ret-border)] bg-[var(--ret-surface)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-dim)] transition-colors hover:border-[var(--ret-purple)]/40 hover:text-[var(--ret-purple)]"
											>
												{l.label} {"->"}
											</a>
										))}
									</div>
								) : null}
							</div>
						</>
					);
					return s.href ? (
						<a
							key={s.mark}
							href={s.href}
							target="_blank"
							rel="noreferrer"
							className="group flex flex-col gap-3 bg-[var(--ret-bg)] p-6 transition-colors duration-200 hover:bg-[var(--ret-surface)]"
						>
							{inner}
						</a>
					) : (
						<div
							key={s.mark}
							className="group flex flex-col gap-3 bg-[var(--ret-bg)] p-6"
						>
							{inner}
						</div>
					);
				})}
			</div>
		</div>
	);
}
