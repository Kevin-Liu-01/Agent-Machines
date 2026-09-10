import type { ReactNode } from "react";
import { Braces, GitFork, KeyRound, Network, Route, ShieldCheck, TerminalSquare, type LucideIcon } from "@/components/ui/icons";

import { Logo, type Mark } from "@/components/Logo";
import { cn } from "@/lib/cn";
import { HARNESS_CAPABILITIES, SUBSTRATE_CAPABILITIES } from "@/lib/mux/capabilities";

const HARNESS_MARKS: Record<(typeof HARNESS_CAPABILITIES)[number]["kind"], Mark> = {
	"claude-code": "claudecode", codex: "codex", openclaw: "openclaw", hermes: "nous",
};
const SUBSTRATE_MARKS: Record<(typeof SUBSTRATE_CAPABILITIES)[number]["kind"], Mark> = {
	e2b: "e2b", sprites: "sprites", vercel: "vercel", daytona: "daytona", dedalus: "retired",
};
const ROUTER_CHECKS: ReadonlyArray<{ icon: LucideIcon; title: string; body: string }> = [
	{ icon: KeyRound, title: "Credential presence", body: "Consider configured provider lanes." },
	{ icon: Network, title: "Workload compatibility", body: "Match the capabilities the job needs." },
	{ icon: ShieldCheck, title: "Provider health", body: "Account for recent routing outcomes." },
	{ icon: GitFork, title: "Eligible backups", body: "Retry routing-safe creation failures." },
];

/** A routing explanation, not live telemetry or a promise that every lane is eligible. */
export function MuxDiagram({ className }: { className?: string }) {
	return (
		<figure className={cn("m-0", className)}>
			<div className={cn("grid gap-7 lg:grid-cols-[minmax(0,1fr)_32px_minmax(0,1.1fr)_32px_minmax(0,1fr)] lg:gap-0")}>
				<Plane title="Agent runtimes" detail="How the Worker does the job" icon={Braces}>
					{HARNESS_CAPABILITIES.map((runtime) => (
						<MachineNode key={runtime.kind} mark={HARNESS_MARKS[runtime.kind]} label={runtime.label} detail={upstreamLabel(runtime.requiredUpstream)} />
					))}
				</Plane>
				<RouteRail />
				<div className={cn("flex min-w-0 flex-col justify-center rounded-lg border border-[var(--ret-border)]/60 bg-[var(--ret-bg-soft)] p-5 md:p-6 lg:mt-[76px]")}>
					<div className={cn("flex flex-col items-center gap-4 text-center")}><Logo mark="am" size={44} /><h3 className={cn("text-xl font-semibold tracking-tight text-[var(--ret-text)]")}>One routing decision</h3></div>
					<ul className={cn("mt-7 grid grid-cols-2 gap-x-4 gap-y-6")}>
						{ROUTER_CHECKS.map(({ icon: Icon, title }) => (
							<li key={title} className={cn("flex flex-col items-center gap-2 text-center")}><Icon size={26} className={cn("text-[var(--ret-text-secondary)]")} aria-hidden="true" /><p className={cn("max-w-[16ch] text-sm font-medium leading-relaxed text-[var(--ret-text)]")}>{title}</p></li>
						))}
					</ul>
					<p className={cn("mt-7 border-t border-[var(--ret-border)]/40 pt-4 text-center text-sm text-[var(--ret-text-dim)]")}>The Worker stays yours.</p>
				</div>
				<RouteRail outgoing />
				<Plane title="Sandbox providers" detail="Where the Worker runs" icon={TerminalSquare}>
					{SUBSTRATE_CAPABILITIES.map((provider, index) => (
						<MachineNode key={provider.kind} mark={SUBSTRATE_MARKS[provider.kind]} label={provider.label} detail={ptyLabel(provider.pty)} badge={index === 0 ? "Primary" : "Backup"} />
					))}
				</Plane>
			</div>
			<figcaption className={cn("mt-6 border-t border-[var(--ret-border)]/40 pt-4 text-sm leading-relaxed text-[var(--ret-text-dim)]")}>
				<div className={cn("flex flex-wrap items-center justify-between gap-x-6 gap-y-2")}><span className={cn("flex items-center gap-2 font-medium text-[var(--ret-text-secondary)]")}><Route size={17} aria-hidden="true" />Routing illustration</span><p>Primary and backup lanes are examples, not live status.</p></div>
				<details className={cn("group mt-3")}>
					<summary className={cn("w-fit cursor-pointer rounded-sm py-2 text-sm font-medium text-[var(--ret-text-secondary)] hover:text-[var(--ret-text)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ret-text)]")}>How placement works</summary>
					<div className={cn("pt-3")}><p className={cn("max-w-[90ch]")}>Actual placement depends on configuration, capabilities, and provider health. Preflight checks key presence, not vendor credential validity.</p><ul className={cn("mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4")}>{ROUTER_CHECKS.map(({ icon: Icon, title, body }) => <li key={title}><p className={cn("flex items-center gap-2 font-medium text-[var(--ret-text-secondary)]")}><Icon size={18} aria-hidden="true" />{title}</p><p className={cn("mt-1")}>{body}</p></li>)}</ul></div>
				</details>
			</figcaption>
		</figure>
	);
}

function Plane({ title, detail, icon: Icon, children }: { title: string; detail: string; icon: LucideIcon; children: ReactNode }) {
	return (
		<section className={cn("flex min-w-0 flex-col")}>
			<div className={cn("min-h-[76px] pb-5")}><h3 className={cn("flex items-center gap-2.5 text-lg font-semibold text-[var(--ret-text)]")}><Icon size={21} aria-hidden="true" />{title}</h3><p className={cn("mt-1.5 text-sm text-[var(--ret-text-dim)]")}>{detail}</p></div>
			<ul className={cn("grid flex-1 auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-1")}>{children}</ul>
		</section>
	);
}

function MachineNode({ mark, label, detail, badge }: { mark: Mark; label: string; detail: string; badge?: string }) {
	return (
		<li className={cn("flex min-w-0 items-center gap-3 rounded-md border border-[var(--ret-border)]/50 bg-[var(--ret-bg-mid)] px-4 py-4")}>
			<span className={cn("grid size-10 shrink-0 place-items-center text-[var(--ret-text)]")}><Logo mark={mark} size={27} /></span>
			<div className={cn("min-w-0 flex-1")}><p className={cn("text-base font-semibold text-[var(--ret-text)]")}>{label}</p><p className={cn("mt-1 text-sm leading-relaxed text-[var(--ret-text-dim)]")}>{detail}</p></div>
			{badge ? <span className={cn("shrink-0 self-start text-xs text-[var(--ret-text-muted)]")}>{badge}</span> : null}
		</li>
	);
}

function RouteRail({ outgoing = false }: { outgoing?: boolean }) {
	return (
		<div aria-hidden="true" className={cn("hidden pt-[76px] lg:block")}>
			<svg viewBox="0 0 32 400" preserveAspectRatio="none" className={cn("h-full w-full text-[var(--ret-border-hover)]")}>
				{[48, 149, 251, 352].map((y, index) => <path key={y} d={outgoing ? `M0 200 H12 V${y} H32` : `M0 ${y} H20 V200 H32`} stroke="currentColor" strokeWidth="1" strokeDasharray={outgoing && index > 0 ? "3 5" : undefined} fill="none" vectorEffect="non-scaling-stroke" />)}
			</svg>
		</div>
	);
}

function upstreamLabel(upstream: "anthropic" | "openai" | "any") {
	if (upstream === "anthropic") return "Anthropic models";
	if (upstream === "openai") return "OpenAI models";
	return "Compatible model routes";
}

function ptyLabel(pty: "native" | "tmux" | "none") {
	if (pty === "native") return "Native terminal";
	if (pty === "tmux") return "Terminal via tmux";
	return "No interactive terminal";
}
