import { Logo } from "@/components/Logo";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";

const STATS: ReadonlyArray<{ label: string; value: string; hint?: string }> = [
	{ label: "vCPU", value: "1", hint: "second-billed" },
	{ label: "memory", value: "2 GiB" },
	{ label: "storage", value: "10 GiB", hint: "persists across sleeps" },
	{ label: "boot", value: "<30s", hint: "cold . <5s warm" },
	{ label: "skills", value: "95", hint: "bundled + wiki" },
	{ label: "fleet", value: "per-account", hint: "Clerk-tied" },
];

type StackEntry = {
	mark: "dedalus" | "agent" | "cursor";
	name: string;
	role: string;
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
		role: "runtime",
		href: "https://docs.dedaluslabs.ai/dcs",
	},
	{
		mark: "agent",
		name: "Hermes / OpenClaw",
		role: "agent",
		links: [
			{ label: "Hermes", href: "https://github.com/NousResearch/hermes-agent" },
			{ label: "OpenClaw", href: "https://github.com/openclaw/openclaw" },
		],
	},
	{
		mark: "cursor",
		name: "Cursor SDK",
		role: "codework",
		href: "https://cursor.com/docs/sdk/typescript",
	},
];

/**
 * Two strips one above the other, both rendered with the chanhdai
 * dense-table look: hairline cells, mono labels, no margins, no
 * rounding. Stats first (the runtime shape), then Stack (the three
 * partners). Together they fit in the same vertical real estate that
 * the old StatsRow alone took.
 */
export function StatsRow() {
	return (
		<div className="mt-10">
			<ReticleLabel>MACHINE -- STACK</ReticleLabel>
			<div className="mt-3 grid grid-cols-2 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] sm:grid-cols-3 lg:grid-cols-6">
				{STATS.map((s) => (
					<div
						key={s.label}
						className="flex flex-col gap-1 bg-[var(--ret-bg)] px-4 py-3 transition-colors duration-150 hover:bg-[var(--ret-surface)]"
					>
						<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							{s.label}
						</p>
						<p className="font-mono text-base tabular-nums text-[var(--ret-text)]">
							{s.value}
						</p>
						{s.hint ? (
							<p className="font-mono text-[10px] tracking-wide text-[var(--ret-text-dim)]">
								{s.hint}
							</p>
						) : null}
					</div>
				))}
			</div>

			<div className="mt-px grid grid-cols-1 gap-px overflow-hidden border border-[var(--ret-border)] border-t-0 bg-[var(--ret-border)] md:grid-cols-3">
				{STACK.map((s) => {
					const inner = (
						<>
							<Logo mark={s.mark} size={20} />
							<div className="min-w-0 flex-1">
								<p className="text-sm font-semibold tracking-tight text-[var(--ret-text)] group-hover:text-[var(--ret-purple)]">
									{s.name}
								</p>
								<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
									{s.role} layer
								</p>
							</div>
						</>
					);
					if (s.href) {
						return (
							<a
								key={s.mark}
								href={s.href}
								target="_blank"
								rel="noreferrer"
								className="group flex items-center gap-3 bg-[var(--ret-bg)] px-4 py-3 transition-colors duration-150 hover:bg-[var(--ret-surface)]"
							>
								{inner}
								<span className="font-mono text-[11px] text-[var(--ret-text-muted)] group-hover:text-[var(--ret-purple)]">
									{"->"}
								</span>
							</a>
						);
					}
					const links = s.links ?? [];
					return (
						<div
							key={s.mark}
							className="group flex items-center gap-3 bg-[var(--ret-bg)] px-4 py-3"
						>
							{inner}
							<span className="ml-auto flex shrink-0 items-center gap-1.5">
								{links.map((l) => (
									<a
										key={l.href}
										href={l.href}
										target="_blank"
										rel="noreferrer"
										className="border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-dim)] transition-colors hover:border-[var(--ret-purple)]/40 hover:text-[var(--ret-purple)]"
									>
										{l.label} {"->"}
									</a>
								))}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
