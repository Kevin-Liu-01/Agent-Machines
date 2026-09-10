import type { ReactNode } from "react";

import { Logo, type Mark } from "@/components/Logo";
import { ServiceIcon, type ServiceSlug } from "@/components/ServiceIcon";
import { Check, Clock, Code2, Database, FileCheck2, FileText, Fingerprint, KeyRound, LayoutDashboard, LockKeyhole, MemoryStick, PackageOpen, Play, ScrollText, SquareTerminal } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/** Static examples only: no actions, telemetry, or provider requests. */
export function CapabilityDiagram({ id }: { id: string }) {
	switch (id) {
		case "compose": return <ComposeDiagram />;
		case "operate": return <OperateDiagram />;
		case "work": return <WorkDiagram />;
		case "extend": return <ExtendDiagram />;
		case "observe": return <ObserveDiagram />;
		default: return <ProtectDiagram />;
	}
}

function Surface({ id, label, children }: { id: string; label: string; children: ReactNode }) {
	return (
		<figure data-capability-diagram={id} aria-label={label} className={cn("@container relative flex min-h-[340px] min-w-0 flex-col justify-center px-4 py-5 sm:px-6")}
			style={{ backgroundImage: "radial-gradient(color-mix(in srgb, var(--ret-border) 40%, transparent) 0.6px, transparent 0.6px)", backgroundSize: "20px 20px" }}>
			<figcaption className={cn("mb-6 flex items-center gap-2 text-[13px] leading-5 text-[var(--ret-text-muted)]")}>
				<span aria-hidden="true" className={cn("h-1.5 w-1.5 bg-[var(--ret-border)]")} /> Illustration · Not live data
			</figcaption>
			<div className={cn("my-auto min-w-0")}>{children}</div>
		</figure>
	);
}

/** Only connector geometry scales. All labels are HTML siblings. */
function Wiring({ paths, className = "h-10", viewBox = "0 0 300 40" }: { paths: readonly string[]; className?: string; viewBox?: string }) {
	return (
		<svg data-diagram-connector="" aria-hidden="true" focusable="false" viewBox={viewBox} preserveAspectRatio="none" fill="none" className={cn("block w-full text-[var(--ret-purple)]/45", className)}>
			{paths.map((path, index) => <path key={index} d={path} stroke="currentColor" strokeWidth={1.2} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />)}
		</svg>
	);
}

function ComposeDiagram() {
	const parts: ReadonlyArray<{ label: string; name: string; mark: Mark }> = [
		{ label: "Agent", name: "Hermes", mark: "nous" },
		{ label: "Model connection", name: "OpenAI", mark: "openai" },
		{ label: "Sandbox", name: "E2B", mark: "e2b" },
	];
	return (
		<Surface id="compose" label="Worker recipe assembly example">
			<div className={cn("grid grid-cols-3 gap-2")}>
				{parts.map((part) => <div key={part.label} className={cn("flex min-w-0 flex-col items-center gap-2 bg-[var(--ret-bg)] py-3 text-center")}>
					<p className={cn("flex min-h-10 items-center text-[13px] leading-5 text-[var(--ret-text-muted)]")}>{part.label}</p>
					<Logo mark={part.mark} size={28} />
					<p className={cn("text-base font-medium")}>{part.name}</p>
				</div>)}
			</div>
			<Wiring paths={["M50 0V18H250V0", "M150 0V38", "M145 32L150 38L155 32"]} />
			<div className={cn("relative mx-2 mb-3")}>
				<div aria-hidden="true" className={cn("absolute -bottom-3 left-3 right-3 h-8 border border-[var(--ret-purple)]/20 bg-[var(--ret-bg)]")} />
				<div aria-hidden="true" className={cn("absolute -bottom-1.5 left-1.5 right-1.5 h-8 border border-[var(--ret-purple)]/25 bg-[var(--ret-bg)]")} />
				<div className={cn("relative border border-[var(--ret-purple)]/35 bg-[var(--ret-bg)] p-4")}>
					<div className={cn("flex items-center gap-3")}><Fingerprint size={32} aria-hidden="true" className={cn("shrink-0 text-[var(--ret-purple)]")} /><div><p className={cn("text-[13px] text-[var(--ret-text-muted)]")}>Saved recipe</p><p className={cn("text-lg font-medium")}>Research Worker</p></div></div>
					<div className={cn("mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-[var(--ret-border)]/40 pt-3 text-sm text-[var(--ret-text-dim)]")}><span>Memory</span><span>Tools</span><span>Schedule</span></div>
				</div>
			</div>
		</Surface>
	);
}

function OperateDiagram() {
	return (
		<Surface id="operate" label="Lifecycle loop and operation journal example">
			<div className={cn("relative grid grid-cols-2 gap-8 py-12")}>
				<Wiring viewBox="0 0 300 180" className={cn("absolute inset-0 h-full")} paths={["M75 68V22H225V40", "M220 34L225 41L230 34", "M225 112V158H75V140", "M70 146L75 139L80 146"]} />
				<p className={cn("absolute left-1/2 top-1 -translate-x-1/2 bg-[var(--ret-bg)] px-3 text-[13px] text-[var(--ret-text-muted)]")}>Pause</p>
				<div className={cn("relative mx-auto flex min-w-0 flex-col items-center gap-2 bg-[var(--ret-bg)] px-4 py-4")}><Play size={28} aria-hidden="true" className={cn("text-[var(--ret-purple)]")} /><p className={cn("text-lg font-medium")}>Running</p></div>
				<div className={cn("relative mx-auto flex min-w-0 flex-col items-center gap-2 bg-[var(--ret-bg)] px-4 py-4")}><Clock size={28} aria-hidden="true" className={cn("text-[var(--ret-text-muted)]")} /><p className={cn("text-lg font-medium")}>Paused</p></div>
				<p className={cn("absolute bottom-1 left-1/2 -translate-x-1/2 bg-[var(--ret-bg)] px-3 text-[13px] text-[var(--ret-text-muted)]")}>Resume</p>
			</div>
			<p className={cn("mt-1 text-center text-[13px] text-[var(--ret-text-muted)]")}>Where the provider supports it</p>
			<div className={cn("mt-5 border-t border-[var(--ret-border)]/40 pt-4")}>
				<p className={cn("flex items-center gap-2 text-sm font-medium")}><ScrollText size={20} aria-hidden="true" className={cn("text-[var(--ret-purple)]")} /> Operation journal</p>
				<ol className={cn("mt-3 grid grid-cols-3 border-t border-[var(--ret-border)]/60 text-[13px] text-[var(--ret-text-dim)]")}>
					{["Requested", "Progress", "Result"].map((label) => <li key={label} className={cn("relative pt-3")}><span aria-hidden="true" className={cn("absolute -top-1 left-0 h-2 w-2 border border-[var(--ret-purple)]/50 bg-[var(--ret-bg)]")} />{label}</li>)}
				</ol>
			</div>
		</Surface>
	);
}

function WorkDiagram() {
	return (
		<Surface id="work" label="Terminal session and resulting artifact example">
			<div className={cn("border border-[var(--ret-border)]/45 bg-[var(--ret-bg)]")}>
				<div className={cn("flex items-center gap-2 border-b border-[var(--ret-border)]/30 px-4 py-3 text-sm")}><SquareTerminal size={20} aria-hidden="true" className={cn("text-[var(--ret-purple)]")} />Worker terminal</div>
				<div className={cn("space-y-2 px-4 py-4 font-mono text-sm leading-6")}><p><span aria-hidden="true" className={cn("text-[var(--ret-purple)]")}>$ </span>codex</p><p className={cn("text-[var(--ret-text-dim)]")}>Summarize the notes.<br />Save a report.md file.</p></div>
			</div>
			<Wiring paths={["M150 0V16", "M65 38V16H235V38", "M60 32L65 38L70 32", "M230 32L235 38L240 32"]} />
			<div className={cn("grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-4")}>
				<div className={cn("flex flex-col items-start gap-2 py-3")}><ScrollText size={24} aria-hidden="true" className={cn("text-[var(--ret-text-muted)]")} /><p className={cn("text-sm font-medium")}>Saved session</p><p className={cn("text-[13px] leading-5 text-[var(--ret-text-muted)]")}>Prompt and history</p></div>
				<div className={cn("relative border border-[var(--ret-border)]/50 bg-[var(--ret-bg)] p-3")}>
					<FileText size={24} aria-hidden="true" className={cn("text-[var(--ret-purple)]")} /><p className={cn("mt-2 break-all font-mono text-sm")}>report.md</p><p className={cn("mt-1 text-[13px] text-[var(--ret-text-muted)]")}>Artifact</p><div aria-hidden="true" className={cn("mt-3 space-y-1.5")}><div className={cn("h-px w-full bg-[var(--ret-border)]/40")} /><div className={cn("h-px w-3/4 bg-[var(--ret-border)]/40")} /></div>
				</div>
			</div>
			<p className={cn("mt-4 flex items-center gap-2 text-[13px] text-[var(--ret-text-muted)]")}><Fingerprint size={16} aria-hidden="true" />Same Worker · linked context and outputs</p>
		</Surface>
	);
}

function ExtendDiagram() {
	const services: ReadonlyArray<{ slug: ServiceSlug; label: string }> = [{ slug: "github", label: "GitHub" }, { slug: "slack", label: "Slack" }, { slug: "playwright", label: "Playwright" }];
	return (
		<Surface id="extend" label="Loadout assembly and connected service example">
			<div className={cn("grid grid-cols-2 gap-5 text-sm")}>
				<div className={cn("flex flex-col items-center gap-2 bg-[var(--ret-bg)] py-3")}><FileCheck2 size={24} aria-hidden="true" className={cn("text-[var(--ret-text-muted)]")} /><p className={cn("font-mono")}>SKILL.md</p></div>
				<div className={cn("flex flex-col items-center gap-2 bg-[var(--ret-bg)] py-3")}><Database size={24} aria-hidden="true" className={cn("text-[var(--ret-text-muted)]")} /><p>Memory</p></div>
			</div>
			<Wiring paths={["M75 0V18H225V0", "M150 18V40"]} />
			<div className={cn("mx-auto flex w-fit max-w-full items-center gap-3 border-y border-[var(--ret-purple)]/40 bg-[var(--ret-bg)] px-5 py-4")}><PackageOpen size={30} aria-hidden="true" className={cn("shrink-0 text-[var(--ret-purple)]")} /><p className={cn("text-lg font-medium")}>Worker loadout</p></div>
			<Wiring paths={["M150 0V40", "M50 40V18H250V40", "M45 34L50 40L55 34", "M145 34L150 40L155 34", "M245 34L250 40L255 34"]} />
			<div className={cn("grid grid-cols-3 gap-2")}>
				{services.map((service) => <div key={service.slug} className={cn("flex min-w-0 flex-col items-center gap-3 bg-[var(--ret-bg)] py-3")}><ServiceIcon slug={service.slug} size={28} /><p className={cn("text-center text-[13px] font-medium")}>{service.label}</p></div>)}
			</div>
			<p className={cn("mt-4 text-[13px] leading-5 text-[var(--ret-text-muted)]")}>Connections require configuration and their own credentials.</p>
		</Surface>
	);
}

function ObserveDiagram() {
	const workers: ReadonlyArray<{ name: string; agent: string; mark: Mark; provider: string; providerMark: Mark; state: string }> = [
		{ name: "Research", agent: "Hermes", mark: "nous", provider: "Daytona", providerMark: "daytona", state: "Running" },
		{ name: "Build", agent: "Codex", mark: "codex", provider: "E2B", providerMark: "e2b", state: "Paused" },
		{ name: "Review", agent: "Claude Code", mark: "claudecode", provider: "Vercel", providerMark: "vercel", state: "Stopped" },
	];
	return (
		<Surface id="observe" label="Fleet topology and example Worker states">
			<div className={cn("grid grid-cols-3 gap-2 text-center text-[13px]")}>
				{[{ label: "Dashboard", Icon: LayoutDashboard }, { label: "SDK", Icon: Code2 }, { label: "CLI", Icon: SquareTerminal }].map(({ label, Icon }) => <div key={label} className={cn("flex flex-col items-center gap-2 bg-[var(--ret-bg)] py-2")}><Icon size={22} aria-hidden="true" className={cn("text-[var(--ret-text-muted)]")} />{label}</div>)}
			</div>
			<Wiring paths={["M50 0V16H250V0", "M150 0V38", "M145 32L150 38L155 32"]} />
			<div className={cn("min-w-0 border-y border-[var(--ret-border)]/45 bg-[var(--ret-bg)]")}>
				<table className={cn("w-full table-fixed text-left text-[13px] leading-5")}>
					<thead><tr className={cn("border-b border-[var(--ret-border)]/30 text-[var(--ret-text-muted)]")}><th scope="col" className={cn("w-[27%] py-3 pr-2 font-normal")}>Worker</th><th scope="col" className={cn("w-[47%] py-3 pr-2 font-normal")}>Agent / provider</th><th scope="col" className={cn("py-3 font-normal")}>State</th></tr></thead>
					<tbody>{workers.map((worker) => <tr key={worker.name} className={cn("border-b border-[var(--ret-border)]/25 last:border-0")}>
						<th scope="row" className={cn("break-words py-4 pr-2 align-top text-sm font-medium")}>{worker.name}</th>
						<td className={cn("py-4 pr-2")}><div className={cn("flex items-start gap-1.5")}><Logo mark={worker.mark} size={18} /><span>{worker.agent}</span></div><div className={cn("mt-2 flex items-center gap-1.5 text-[var(--ret-text-muted)]")}><Logo mark={worker.providerMark} size={16} /><span>{worker.provider}</span></div></td>
						<td className={cn("py-4 align-top text-[var(--ret-text-dim)]")}>{worker.state}</td>
					</tr>)}</tbody>
				</table>
			</div>
			<p className={cn("mt-3 text-[13px] text-[var(--ret-text-muted)]")}>Recorded activity. Unknown usage stays unknown.</p>
		</Surface>
	);
}

function ProtectDiagram() {
	return (
		<Surface id="protect" label="Credential visibility and persistence boundary example">
			<div className={cn("border border-dashed border-[var(--ret-purple)]/40 bg-[var(--ret-bg)] p-4")}>
				<p className={cn("flex items-center gap-2 text-[13px] font-medium text-[var(--ret-purple)]")}><LockKeyhole size={18} aria-hidden="true" />Account boundary</p>
				<div className={cn("mt-4 grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)] items-center gap-2")}>
					<div><KeyRound size={24} aria-hidden="true" className={cn("mb-2 text-[var(--ret-text-muted)]")} /><p className={cn("text-sm font-medium")}>Saved credentials</p><p className={cn("mt-1 text-[13px] text-[var(--ret-text-muted)]")}>Server-side</p></div>
					<Wiring viewBox="0 0 28 30" className={cn("h-8")} paths={["M0 15H26", "M20 9L26 15L20 21"]} />
					<div><LayoutDashboard size={24} aria-hidden="true" className={cn("mb-2 text-[var(--ret-text-muted)]")} /><p className={cn("text-sm font-medium")}>Settings</p><p className={cn("mt-1 flex items-center gap-1 text-[13px] text-[var(--ret-text-dim)]")}><Check size={14} aria-hidden="true" />Configured</p></div>
				</div>
				<p className={cn("mt-4 border-t border-[var(--ret-border)]/30 pt-3 text-[13px] leading-5 text-[var(--ret-text-muted)]")}>Presence, not secret values, is returned to settings.</p>
			</div>
			<div className={cn("mt-5 flex items-start gap-3 border border-dashed border-[var(--ret-border)]/40 px-3 py-3 text-[var(--ret-text-muted)]")}><MemoryStick size={22} aria-hidden="true" className={cn("shrink-0")} /><p className={cn("text-sm")}>Process memory <span className={cn("block text-[13px]")}>Pause behavior is provider-dependent</span></p></div>
			<div className={cn("mt-2 flex items-center gap-3 border-b-4 border-[var(--ret-purple)]/35 bg-[var(--ret-bg)] px-3 py-4")}><Database size={28} aria-hidden="true" className={cn("shrink-0 text-[var(--ret-purple)]")} /><div><p className={cn("text-base font-medium")}>Persistent files</p><p className={cn("mt-1 text-[13px] leading-5 text-[var(--ret-text-muted)]")}>Memory · sessions · outputs</p></div></div>
		</Surface>
	);
}
