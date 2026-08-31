import {
	GitFork,
	KeyRound,
	Network,
	Route,
	ShieldCheck,
	TerminalSquare,
	type LucideIcon,
} from "lucide-react";

import { Logo, type Mark } from "@/components/Logo";
import { cn } from "@/lib/cn";
import {
	HARNESS_CAPABILITIES,
	SUBSTRATE_CAPABILITIES,
} from "@/lib/mux/capabilities";

/**
 * A literal view of the mux's two decisions: select an agent runtime, then
 * place it on a compatible sandbox. Brand marks identify the replaceable
 * machinery while the center backplane explains the policy Agent Machines
 * owns. The solid provider rail is the primary route; dashed rails are
 * failover candidates.
 */

const HARNESS_MARKS: Record<
	(typeof HARNESS_CAPABILITIES)[number]["kind"],
	Mark
> = {
	"claude-code": "claudecode",
	codex: "codex",
	openclaw: "openclaw",
	hermes: "nous",
};

const SUBSTRATE_MARKS: Record<
	(typeof SUBSTRATE_CAPABILITIES)[number]["kind"],
	Mark
> = {
	e2b: "e2b",
	sprites: "sprites",
	vercel: "vercel",
	dedalus: "dedalus",
};

const ROUTER_CHECKS: ReadonlyArray<{
	icon: LucideIcon;
	label: string;
}> = [
	{ icon: KeyRound, label: "Credentials verified." },
	{ icon: Network, label: "Constraints matched." },
	{ icon: ShieldCheck, label: "Failure contained." },
	{ icon: GitFork, label: "Failover automatic." },
];

export function MuxDiagram({ className }: { className?: string }) {
	return (
		<figure
			className={cn(
				"relative m-0 overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-surface)]/35",
				className,
			)}
		>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 bg-[linear-gradient(var(--ret-border)_1px,transparent_1px),linear-gradient(90deg,var(--ret-border)_1px,transparent_1px)] bg-[size:32px_32px] opacity-[0.16]"
			/>

			<div className="relative grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(190px,1fr)_48px_minmax(190px,0.86fr)_48px_minmax(190px,1fr)] lg:items-stretch lg:gap-0 lg:p-6">
				<Plane
					label="Agent runtimes"
					detail="Harness and model path"
					className="lg:pr-0"
				>
					{HARNESS_CAPABILITIES.map((runtime) => (
						<MachineNode
							key={runtime.kind}
							mark={HARNESS_MARKS[runtime.kind]}
							label={runtime.label}
							detail={upstreamLabel(runtime.requiredUpstream)}
						/>
					))}
				</Plane>

				<FanInRail />

				<RouterCore />

				<FanOutRail />

				<Plane
					label="Sandbox providers"
					detail="Placement and terminal"
					className="lg:pl-0"
				>
					{SUBSTRATE_CAPABILITIES.map((substrate, index) => (
						<MachineNode
							key={substrate.kind}
							mark={SUBSTRATE_MARKS[substrate.kind]}
							label={substrate.label}
							detail={ptyLabel(substrate.pty)}
							active={index === 0}
							badge={index === 0 ? "Primary" : "Failover"}
						/>
					))}
				</Plane>
			</div>

			<figcaption className="sr-only">
				Agent Machines selects one of four agent runtimes and places it on one
				of four sandbox providers. Credentials and constraints are checked
				before routing. The primary lane is solid and failover lanes are dashed.
			</figcaption>
		</figure>
	);
}

function Plane({
	label,
	detail,
	children,
	className,
}: {
	label: string;
	detail: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<section className={cn("relative z-10 flex min-w-0 flex-col", className)}>
			<div className="mb-3 flex min-h-9 items-end justify-between gap-3 border-b border-[var(--ret-border)] pb-2">
				<h3 className="font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-[var(--ret-text)]">
					{label}
				</h3>
				<span className="text-right font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--ret-text-muted)]">
					{detail}
				</span>
			</div>
			<div className="grid flex-1 grid-rows-4 gap-2.5">{children}</div>
		</section>
	);
}

function MachineNode({
	mark,
	label,
	detail,
	active = false,
	badge,
}: {
	mark: Mark;
	label: string;
	detail: string;
	active?: boolean;
	badge?: "Primary" | "Failover";
}) {
	return (
		<div
			className={cn(
				"group relative flex min-h-[62px] items-center gap-3 overflow-hidden border bg-[var(--ret-bg)] px-3.5 py-3 transition-colors",
				active
					? "border-[var(--ret-text-secondary)]"
					: "border-[var(--ret-border)] hover:border-[var(--ret-border-hover)]",
			)}
		>
			{active ? (
				<span
					aria-hidden="true"
					className="absolute inset-y-0 left-0 w-px bg-[var(--ret-text)] shadow-[0_0_12px_var(--ret-text-secondary)]"
				/>
			) : null}
			<span className="grid size-8 shrink-0 place-items-center border border-[var(--ret-border)] bg-[var(--ret-surface)] text-[var(--ret-text)]">
				<Logo mark={mark} size={17} />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block truncate text-[13px] font-semibold text-[var(--ret-text)]">
					{label}
				</span>
				<span className="mt-0.5 block truncate font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ret-text-muted)]">
					{detail}
				</span>
			</span>
			{badge ? (
				<span
					className={cn(
						"shrink-0 font-mono text-[8px] uppercase tracking-[0.12em]",
						active
							? "text-[var(--ret-text)]"
							: "text-[var(--ret-text-muted)]",
					)}
				>
					{badge}
				</span>
			) : null}
		</div>
	);
}

function RouterCore() {
	return (
		<section className="relative z-10 flex min-h-[330px] flex-col items-center justify-center overflow-hidden border border-[var(--ret-text-secondary)] bg-[var(--ret-bg)] px-4 py-6 text-center lg:mt-[48px] lg:min-h-0">
			<div className="relative grid size-12 place-items-center rounded-full border border-[var(--ret-text-secondary)] bg-[var(--ret-surface)] text-[var(--ret-text)] shadow-[0_0_32px_color-mix(in_srgb,var(--ret-text)_8%,transparent)]">
				<Route size={20} strokeWidth={1.5} aria-hidden="true" />
			</div>
			<div className="relative mt-4 font-mono text-[8px] uppercase tracking-[0.24em] text-[var(--ret-text-muted)]">
				Placement engine
			</div>
			<h3 className="relative mt-1.5 text-[17px] font-semibold tracking-[-0.02em] text-[var(--ret-text)]">
				Route one Worker.
			</h3>
			<p className="relative mt-2 max-w-[23ch] text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
				Select a compatible runtime and sandbox, then preserve the Worker above
				them.
			</p>

			<div className="relative mt-5 grid w-full gap-px border border-[var(--ret-border)] bg-[var(--ret-border)] text-left">
				{ROUTER_CHECKS.map(({ icon: Icon, label }) => (
					<div
						key={label}
						className="flex items-center gap-2 bg-[var(--ret-bg)] px-2.5 py-2"
					>
						<Icon
							size={12}
							strokeWidth={1.6}
							className="shrink-0 text-[var(--ret-text-secondary)]"
							aria-hidden="true"
						/>
						<span className="text-[9.5px] font-medium text-[var(--ret-text-dim)]">
							{label}
						</span>
					</div>
				))}
			</div>

			<div className="relative mt-4 flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">
				<TerminalSquare size={11} strokeWidth={1.5} aria-hidden="true" />
				Fail-closed. Failover-ready.
			</div>
		</section>
	);
}

function FanInRail() {
	return (
		<div
			aria-hidden="true"
			className="relative z-0 hidden pt-[48px] lg:block"
		>
			<svg className="h-full w-full overflow-visible" viewBox="0 0 48 310" preserveAspectRatio="none">
				{[31, 114, 197, 279].map((y) => (
					<path
						key={y}
						d={`M0 ${y} H20 L48 155`}
						fill="none"
						stroke="currentColor"
						strokeWidth="1"
						vectorEffect="non-scaling-stroke"
						className="text-[var(--ret-border-hover)]"
					/>
				))}
				<circle cx="47" cy="155" r="2" fill="currentColor" className="text-[var(--ret-text-secondary)]" />
			</svg>
		</div>
	);
}

function FanOutRail() {
	return (
		<div
			aria-hidden="true"
			className="relative z-0 hidden pt-[48px] lg:block"
		>
			<svg className="h-full w-full overflow-visible" viewBox="0 0 48 310" preserveAspectRatio="none">
				{[31, 114, 197, 279].map((y, index) => (
					<path
						key={y}
						d={`M0 155 L28 ${y} H48`}
						fill="none"
						stroke="currentColor"
						strokeWidth={index === 0 ? "1.5" : "1"}
						strokeDasharray={index === 0 ? undefined : "4 4"}
						vectorEffect="non-scaling-stroke"
						className={
							index === 0
								? "text-[var(--ret-text-secondary)]"
								: "text-[var(--ret-border-hover)]"
						}
					/>
				))}
				<circle cx="1" cy="155" r="2" fill="currentColor" className="text-[var(--ret-text-secondary)]" />
			</svg>
		</div>
	);
}

function upstreamLabel(upstream: "anthropic" | "openai" | "any") {
	if (upstream === "anthropic") return "Anthropic upstream";
	if (upstream === "openai") return "OpenAI upstream";
	return "Route-compatible upstream";
}

function ptyLabel(pty: "native" | "tmux" | "none") {
	if (pty === "native") return "Native PTY";
	if (pty === "tmux") return "PTY via tmux";
	return "No interactive PTY";
}
