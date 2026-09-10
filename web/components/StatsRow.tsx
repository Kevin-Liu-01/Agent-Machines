import Link from "next/link";
import { ArrowRight, Braces, FileCode2, GitFork, KeyRound, Radio, Route, TerminalSquare, type LucideIcon } from "@/components/ui/icons";

import { CopyCodeButton } from "@/components/CopyCodeButton";
import { Logo } from "@/components/Logo";
import { MuxDiagram } from "@/components/MuxDiagram";
import { cn } from "@/lib/cn";
import { LANDING_BODY, LANDING_EYEBROW, LANDING_INSET, LANDING_SECTION_SPACE, LANDING_SPLIT, LANDING_TITLE } from "@/lib/marketing/layout";
import { highlightTypeScript } from "@/lib/marketing/sdk-syntax.server";
import syntax from "@/lib/marketing/sdk-syntax.module.css";

const INSTALL_CODE = "npm i agent-machines";

// One source for the displayed example and clipboard contents.
export const SDK_EXAMPLE = `import { createMux } from "agent-machines";

// Reads your configuration and environment keys.
const mux = createMux();

const worker = await mux.create({
  agent: "claude-code",
  sandbox: "auto", // Use your configured provider lanes.
  name: "reviewer",
});

for await (const event of worker.run("Review my repo")) {
  if (event.type === "text") {
    process.stdout.write(event.delta);
  }
}`;

const FEATURES: ReadonlyArray<{ icon: LucideIcon; title: string }> = [
	{ icon: Braces, title: "One typed API" },
	{ icon: GitFork, title: "Eligible creation failover" },
	{ icon: Radio, title: "Events + terminal access" },
];

const PIPELINE: ReadonlyArray<{ icon: LucideIcon; title: string; code: string }> = [
	{ icon: TerminalSquare, title: "Install the SDK", code: INSTALL_CODE },
	{ icon: KeyRound, title: "Connect your providers", code: "agent-machines.json" },
	{ icon: Route, title: "Create the Worker", code: 'mux.create({ sandbox: "auto" })' },
	{ icon: Radio, title: "Run and inspect", code: "worker.run(prompt)" },
];

const ACTION = cn(
	"inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium",
	"transition-colors duration-150 hover:bg-[var(--ret-surface-hover)]",
	"focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ret-text)] focus-visible:transition-none motion-reduce:transition-none",
);

const EXAMPLE_PANEL = "grid min-w-0 grid-rows-[auto_1fr_auto] overflow-hidden rounded-lg border border-[var(--ret-border)]/60 lg:row-span-3 lg:grid-rows-subgrid";
const EXAMPLE_HEADER = "grid content-center gap-3 border-b border-[var(--ret-border)]/40 px-5 py-4 md:px-6";
const EXAMPLE_FOOTER = "flex items-center gap-3 border-t border-[var(--ret-border)]/40 px-5 py-5 md:px-6";

export function StatsRow() {
	return (
		<div className={cn("bg-[var(--ret-bg)]")}>
			<section aria-labelledby="sdk-heading" className={cn(LANDING_INSET, LANDING_SECTION_SPACE)}>
				<header className={cn(LANDING_SPLIT, "mb-8 items-end")}>
				<div className={cn("min-w-0")}>
					<div className={cn(LANDING_EYEBROW)}>
						<Logo mark="typescript" size={20} />
						TypeScript SDK
					</div>
					<h2 id="sdk-heading" className={cn(LANDING_TITLE, "max-w-[20ch]")}>
						Create the Worker in code.
					</h2>
				</div>
				<div>
					<p className={cn(LANDING_BODY, "max-w-[48ch]")}>One client. Choose an agent, give it a job, and stream the result.</p>
					<div className={cn("mt-4 flex flex-wrap gap-2")}>
						<Link href="/docs" className={cn(ACTION, "border border-[var(--ret-border)]/60 text-[var(--ret-text)]")}>Read the SDK docs <ArrowRight size={16} aria-hidden="true" /></Link>
						<Link href="/dashboard" className={cn(ACTION, "text-[var(--ret-text-dim)]")}>Try the dashboard <ArrowRight size={16} aria-hidden="true" /></Link>
					</div>
				</div>
				</header>
				<div className={cn(LANDING_SPLIT, "items-stretch lg:grid-rows-[auto_1fr_auto] lg:gap-y-0 xl:gap-y-0")}>
					<CodePanel />
					<WorkerExample />
				</div>
				<ul className={cn("mt-6 grid gap-4 sm:grid-cols-3")}>
					{FEATURES.map(({ icon: Icon, title }) => <li key={title} className={cn("flex items-center gap-3 text-base text-[var(--ret-text-dim)]")}><Icon size={22} className={cn("shrink-0 text-[var(--ret-text)]")} aria-hidden="true" />{title}</li>)}
				</ul>
			</section>

			<section aria-labelledby="routing-heading" className={cn(LANDING_INSET, LANDING_SECTION_SPACE, "border-t border-[var(--ret-border)]/40")}>
				<header className={cn(LANDING_SPLIT, "mb-8 items-end")}>
					<div className={cn("min-w-0")}>
						<p className={cn(LANDING_EYEBROW)}><Route size={18} aria-hidden="true" /> Runtime and infrastructure</p>
						<h2 id="routing-heading" className={cn(LANDING_TITLE)}>Two planes. One route.</h2>
					</div>
					<div className={cn("min-w-0")}>
						<p className={cn(LANDING_BODY, "max-w-[48ch]")}>Choose the agent. Route the compute. Keep the Worker.</p>
						<p className={cn("mt-4 text-sm text-[var(--ret-text-dim)]")}><span className={cn("font-semibold text-[var(--ret-text)]")}>4 runtimes</span> <span aria-hidden="true">×</span> <span className={cn("font-semibold text-[var(--ret-text)]")}>4 providers</span></p>
					</div>
				</header>
				<MuxDiagram />
			</section>

			<section aria-label="SDK setup steps" className={cn(LANDING_INSET, LANDING_SECTION_SPACE, "border-t border-[var(--ret-border)]/40")}>
				<ol className={cn("grid gap-6 sm:grid-cols-2 xl:grid-cols-4 xl:gap-8")}>
					{PIPELINE.map(({ icon: Icon, title, code }, index) => (
						<li key={title} className={cn("relative flex min-w-0 flex-col pb-8")}>
							<Icon size={22} strokeWidth={1.5} className={cn("mb-4 text-[var(--ret-text-secondary)]")} aria-hidden="true" />
							<h3 className={cn("text-lg font-semibold text-[var(--ret-text)]")}>{title}</h3>
							<code className={cn("mt-4 block break-words rounded-md bg-[var(--ret-bg-soft)] px-3 py-2.5 font-mono text-sm leading-relaxed text-[var(--ret-text-secondary)]")}>{code}</code>
							<span aria-hidden="true" className={cn("absolute bottom-0 right-0 text-xl tabular-nums text-[var(--ret-text)]/20")}>{String(index + 1).padStart(2, "0")}</span>
						</li>
					))}
				</ol>
			</section>
		</div>
	);
}

function WorkerExample() {
	return (
		<figure className={cn(EXAMPLE_PANEL, "m-0 bg-[var(--ret-bg-soft)]")}>
			<figcaption className={cn(EXAMPLE_HEADER)}><span className={cn("flex items-center gap-2 text-sm font-medium text-[var(--ret-text)]")}><Braces size={18} aria-hidden="true" />Example configuration</span><p className={cn("text-sm leading-6 text-[var(--ret-text-dim)]")}>The Worker described in <code className={cn("font-mono")}>reviewer.ts</code>.</p></figcaption>
			<div className={cn("flex min-w-0 flex-col justify-center px-5 py-8 md:px-6")}>
				<div className={cn("flex items-center gap-4")}><Logo mark="am" size={44} /><div><p className={cn("text-sm text-[var(--ret-text-dim)]")}>Worker</p><h3 className={cn("mt-1 text-3xl font-semibold tracking-tight")}>reviewer</h3></div></div>
				<dl className={cn("mt-8 space-y-6")}>
					<div><dt className={cn("mb-2 text-sm text-[var(--ret-text-dim)]")}>Agent runtime</dt><dd className={cn("flex items-center gap-3 text-lg font-medium")}><Logo mark="claudecode" size={25} />Claude Code</dd></div>
					<div><dt className={cn("mb-2 text-sm text-[var(--ret-text-dim)]")}>Sandbox placement</dt><dd><p className={cn("flex items-center gap-3 text-lg font-medium")}><Route size={25} aria-hidden="true" />Automatic</p><div className={cn("mt-3 flex flex-wrap gap-2")}>{(["e2b", "sprites", "vercel", "daytona"] as const).map(mark => <span key={mark} className={cn("grid size-10 place-items-center rounded-md border border-[var(--ret-border)]/40 bg-[var(--ret-bg)]")}><Logo mark={mark} size={24} /></span>)}</div></dd></div>
				</dl>
			</div>
			<div className={cn(EXAMPLE_FOOTER)}><TerminalSquare size={24} className={cn("shrink-0 text-[var(--ret-text-dim)]")} aria-hidden="true" /><div><p className={cn("text-sm text-[var(--ret-text-dim)]")}>Task</p><p className={cn("mt-1 text-lg font-medium")}>Review my repo</p></div><ArrowRight size={20} className={cn("ml-auto shrink-0 text-[var(--ret-text-muted)]")} aria-hidden="true" /></div>
		</figure>
	);
}

function CodePanel() {
	return (
		<div className={cn(EXAMPLE_PANEL, "bg-[var(--ret-bg-mid)]")}>
			<div className={cn(EXAMPLE_HEADER)}>
			<div className={cn("flex flex-wrap items-center justify-between gap-3")}>
				<span className={cn("inline-flex min-w-0 items-center gap-2.5 text-sm text-[var(--ret-text-dim)]")}><Logo mark="npm" size={22} /><code className={cn("break-words font-mono text-sm text-[var(--ret-text)]")}>{INSTALL_CODE}</code></span>
				<CopyCodeButton text={INSTALL_CODE} label="Copy install command" />
			</div>
			<div className={cn("flex items-center justify-between gap-3")}>
				<span className={cn("flex min-w-0 items-center gap-2 text-sm text-[var(--ret-text-dim)]")}><FileCode2 size={17} aria-hidden="true" /><span className={cn("truncate")}>reviewer.ts</span></span>
				<CopyCodeButton text={SDK_EXAMPLE} label="Copy SDK example" />
			</div>
			</div>
			<pre tabIndex={0} aria-label="TypeScript Worker example" className={cn("m-0 min-w-0 overflow-x-auto py-5 font-mono text-sm leading-7 text-[var(--ret-text)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ret-text)]")}>
				<span className={cn("flex min-w-max pr-5 md:pr-6")}>
					<span aria-hidden="true" className={cn("pointer-events-none sticky left-0 mr-5 shrink-0 select-none border-r border-[var(--ret-border)]/30 bg-[var(--ret-bg-mid)] pl-5 pr-3 text-right tabular-nums text-[var(--ret-text-muted)] md:pl-6")}>{SDK_EXAMPLE.split("\n").map((_, index) => index + 1).join("\n")}</span>
					<code className={cn(syntax.code, "block")}>{highlightTypeScript(SDK_EXAMPLE)}</code>
				</span>
			</pre>
			<p className={cn(EXAMPLE_FOOTER, "text-sm leading-6 text-[var(--ret-text-dim)]")}><KeyRound size={18} className={cn("shrink-0")} aria-hidden="true" />Bring your own model and sandbox credentials. Only eligible provider lanes are considered.</p>
		</div>
	);
}
