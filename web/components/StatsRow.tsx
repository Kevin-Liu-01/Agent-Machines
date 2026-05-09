import { Logo } from "@/components/Logo";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ServiceIcon, type ServiceSlug } from "@/components/ServiceIcon";
import { ToolIcon } from "@/components/ToolIcon";
import type { ToolCategory } from "@/lib/dashboard/loadout";

const STATS: ReadonlyArray<{
	label: string;
	value: string;
	hint?: string;
	icon: ToolCategory;
}> = [
	{ label: "vCPU", value: "1", hint: "second-billed", icon: "shell" },
	{ label: "memory", value: "2 GiB", icon: "memory" },
	{ label: "storage", value: "10 GiB", hint: "persists across sleeps", icon: "filesystem" },
	{ label: "boot", value: "<30s", hint: "cold . <5s warm", icon: "schedule" },
	{ label: "skills", value: "95", hint: "bundled + wiki", icon: "memory" },
	{ label: "fleet", value: "per-account", hint: "Clerk-tied", icon: "delegate" },
];

type StackIcon =
	| { kind: "logo"; mark: "dedalus" | "cursor" | "nous" | "openclaw" }
	| { kind: "service"; slug: ServiceSlug };

// Every stack entry is one component, one logo, one link. Hermes and
// OpenClaw used to share a "Hermes / OpenClaw" cell with two pill
// buttons inside, which read visually as a pipeline ("HERMES ->
// OPENCLAW ->") instead of two alternative agents -- so they get
// their own cells now, like everything else in the stack.
type StackEntry = {
	id: string;
	icon: StackIcon;
	name: string;
	role: string;
	href: string;
};

const STACK: ReadonlyArray<StackEntry> = [
	{
		id: "dedalus",
		icon: { kind: "logo", mark: "dedalus" },
		name: "Dedalus Machines",
		role: "runtime",
		href: "https://docs.dedaluslabs.ai/dcs",
	},
	{
		id: "hermes",
		icon: { kind: "logo", mark: "nous" },
		name: "Hermes",
		role: "agent (default)",
		href: "https://github.com/NousResearch/hermes-agent",
	},
	{
		id: "openclaw",
		icon: { kind: "logo", mark: "openclaw" },
		name: "OpenClaw",
		role: "agent (preview)",
		href: "https://github.com/openclaw/openclaw",
	},
	{
		id: "cursor",
		icon: { kind: "logo", mark: "cursor" },
		name: "Cursor SDK",
		role: "codework",
		href: "https://cursor.com/docs/sdk/typescript",
	},
	{
		id: "anthropic",
		icon: { kind: "service", slug: "anthropic" },
		name: "Anthropic",
		role: "model provider",
		href: "https://www.anthropic.com/",
	},
	{
		id: "openai",
		icon: { kind: "service", slug: "openai" },
		name: "OpenAI",
		role: "model provider",
		href: "https://openai.com",
	},
	{
		id: "cloudflare",
		icon: { kind: "service", slug: "cloudflare" },
		name: "Cloudflare",
		role: "public tunnel",
		href: "https://www.cloudflare.com/products/tunnel/",
	},
	{
		id: "clerk",
		icon: { kind: "service", slug: "clerk" },
		name: "Clerk",
		role: "auth + fleet",
		href: "https://clerk.com",
	},
	{
		id: "vercel",
		icon: { kind: "service", slug: "vercel" },
		name: "Vercel",
		role: "web console",
		href: "https://vercel.com",
	},
];

function StackIconView({ icon }: { icon: StackIcon }) {
	if (icon.kind === "logo") {
		return <Logo mark={icon.mark} size={20} />;
	}
	return <ServiceIcon slug={icon.slug} size={20} />;
}

/**
 * Two strips one above the other, both rendered with the chanhdai
 * dense-table look: hairline cells, mono labels, no margins, no
 * rounding. Stats first (the runtime shape), then Stack (the three
 * partners). Together they fit in the same vertical real estate that
 * the old StatsRow alone took.
 */
export function StatsRow() {
	return (
		<div>
			<ReticleLabel>MACHINE -- STACK</ReticleLabel>
			<div className="mt-3 grid grid-cols-2 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] sm:grid-cols-3 lg:grid-cols-6">
				{STATS.map((s) => (
					<div
						key={s.label}
						className="flex flex-col gap-1 bg-[var(--ret-bg)] px-4 py-3 transition-colors duration-150 hover:bg-[var(--ret-surface)]"
					>
						<p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							<ToolIcon name={s.icon} size={11} />
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

			{/*
			  Three columns on lg so all 9 stack entries fit cleanly in
			  3 rows of 3. The previous 4-col grid orphaned a cell and
			  forced the role labels ("auth + fleet metadata layer",
			  "web console layer") to truncate. Dropping the redundant
			  " layer" suffix (the section title already says STACK)
			  also helps each role stay on one line.
			*/}
			<div className="mt-px grid grid-cols-1 gap-px overflow-hidden border border-[var(--ret-border)] border-t-0 bg-[var(--ret-border)] sm:grid-cols-2 lg:grid-cols-3">
				{STACK.map((s) => (
					<a
						key={s.id}
						href={s.href}
						target="_blank"
						rel="noreferrer"
						className="group flex items-center gap-3 bg-[var(--ret-bg)] px-4 py-3 transition-colors duration-150 hover:bg-[var(--ret-surface)]"
					>
						<StackIconView icon={s.icon} />
						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-semibold tracking-tight text-[var(--ret-text)] group-hover:text-[var(--ret-purple)]">
								{s.name}
							</p>
							<p className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								{s.role}
							</p>
						</div>
						<span className="font-mono text-[11px] text-[var(--ret-text-muted)] group-hover:text-[var(--ret-purple)]">
							{"->"}
						</span>
					</a>
				))}
			</div>
		</div>
	);
}
