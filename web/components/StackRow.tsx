import { Logo } from "@/components/Logo";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";

const STACK: ReadonlyArray<{
	mark: "dedalus" | "nous" | "cursor";
	name: string;
	role: string;
	href: string;
	tag: string;
}> = [
	{
		mark: "dedalus",
		name: "Dedalus Machines",
		role: "the runtime layer",
		href: "https://docs.dedaluslabs.ai/dcs",
		tag: "microVM + gateway",
	},
	{
		mark: "nous",
		name: "Hermes Agent",
		role: "the agent layer",
		href: "https://github.com/NousResearch/hermes-agent",
		tag: "by Nous Research",
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
			<div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-md border border-[var(--ret-border)] bg-[var(--ret-border)] md:grid-cols-3">
				{STACK.map((s) => (
					<a
						key={s.mark}
						href={s.href}
						target="_blank"
						rel="noreferrer"
						className="group flex flex-col gap-3 bg-[var(--ret-bg)] p-6 transition-colors duration-200 hover:bg-[var(--ret-surface)]"
					>
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
						</div>
					</a>
				))}
			</div>
		</div>
	);
}
