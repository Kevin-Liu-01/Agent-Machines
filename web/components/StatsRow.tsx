"use client";

import type { CSSProperties } from "react";

import { CopyCodeButton } from "@/components/CopyCodeButton";
import { Logo, type Mark } from "@/components/Logo";
import { MuxDiagram } from "@/components/MuxDiagram";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ToolIcon } from "@/components/ToolIcon";
import type { ToolCategory } from "@/lib/dashboard/loadout";
import { cn } from "@/lib/cn";

const INSTALL_CODE = "npm i agent-machines";

const CODE_TEXT = `import { createMux } from "agent-machines"

const mux = createMux() // agent-machines.json: keys + routes

const machine = await mux.create({
  agent: "claude-code",
  sandbox: "auto", // e2b -> sprites -> vercel
  name: "reviewer",
})

for await (const event of machine.run("review my repo")) {
  if (event.type === "text") process.stdout.write(event.delta)
}`;

type CodeTone =
	| "boolean"
	| "class"
	| "comment"
	| "identifier"
	| "keyword"
	| "method"
	| "operator"
	| "property"
	| "punctuation"
	| "string";

const CODE_LINES: ReadonlyArray<{
	no: string;
	indent?: number;
	parts: ReadonlyArray<{ text: string; tone?: CodeTone }>;
}> = [
	{
		no: "01",
		parts: [
			{ text: "import", tone: "keyword" },
			{ text: " ", tone: "punctuation" },
			{ text: "{", tone: "punctuation" },
			{ text: " createMux ", tone: "class" },
			{ text: "}", tone: "punctuation" },
			{ text: " ", tone: "punctuation" },
			{ text: "from", tone: "keyword" },
			{ text: " \"agent-machines\"", tone: "string" },
		],
	},
	{ no: "02", parts: [{ text: "" }] },
	{
		no: "03",
		parts: [
			{ text: "const", tone: "keyword" },
			{ text: " mux", tone: "identifier" },
			{ text: " = ", tone: "operator" },
			{ text: "createMux", tone: "method" },
			{ text: "()", tone: "punctuation" },
			{ text: " // agent-machines.json: keys + routes", tone: "comment" },
		],
	},
	{ no: "04", parts: [{ text: "" }] },
	{
		no: "05",
		parts: [
			{ text: "const", tone: "keyword" },
			{ text: " machine", tone: "identifier" },
			{ text: " = ", tone: "operator" },
			{ text: "await", tone: "keyword" },
			{ text: " mux", tone: "identifier" },
			{ text: ".create", tone: "method" },
			{ text: "({", tone: "punctuation" },
		],
	},
	{
		no: "06",
		indent: 1,
		parts: [
			{ text: "agent", tone: "property" },
			{ text: ": ", tone: "punctuation" },
			{ text: "\"claude-code\"", tone: "string" },
			{ text: ",", tone: "punctuation" },
		],
	},
	{
		no: "07",
		indent: 1,
		parts: [
			{ text: "sandbox", tone: "property" },
			{ text: ": ", tone: "punctuation" },
			{ text: "\"auto\"", tone: "string" },
			{ text: ",", tone: "punctuation" },
			{ text: " // e2b -> sprites -> vercel", tone: "comment" },
		],
	},
	{
		no: "08",
		indent: 1,
		parts: [
			{ text: "name", tone: "property" },
			{ text: ": ", tone: "punctuation" },
			{ text: "\"reviewer\"", tone: "string" },
			{ text: ",", tone: "punctuation" },
		],
	},
	{ no: "09", parts: [{ text: "})", tone: "punctuation" }] },
	{ no: "10", parts: [{ text: "" }] },
	{
		no: "11",
		parts: [
			{ text: "for await", tone: "keyword" },
			{ text: " (", tone: "punctuation" },
			{ text: "const", tone: "keyword" },
			{ text: " event", tone: "identifier" },
			{ text: " of", tone: "keyword" },
			{ text: " machine", tone: "identifier" },
			{ text: ".run", tone: "method" },
			{ text: "(", tone: "punctuation" },
			{ text: "\"review my repo\"", tone: "string" },
			{ text: "))", tone: "punctuation" },
			{ text: " {", tone: "punctuation" },
		],
	},
	{
		no: "12",
		indent: 1,
		parts: [
			{ text: "if", tone: "keyword" },
			{ text: " (event.type", tone: "identifier" },
			{ text: " === ", tone: "operator" },
			{ text: "\"text\"", tone: "string" },
			{ text: ") ", tone: "punctuation" },
			{ text: "process.stdout", tone: "identifier" },
			{ text: ".write", tone: "method" },
			{ text: "(event.delta)", tone: "punctuation" },
		],
	},
	{ no: "13", parts: [{ text: "}", tone: "punctuation" }] },
];

/**
 * Everything the router multiplexes, with real marks. Agents install
 * into whichever sandbox the route lands on; both rows stay in sync
 * with the registries in src/mux (four harnesses, four substrates).
 */
const AGENT_MARKS: ReadonlyArray<{ mark: Mark; label: string }> = [
	{ mark: "claudecode", label: "Claude Code" },
	{ mark: "codex", label: "Codex CLI" },
	{ mark: "openclaw", label: "OpenClaw" },
	{ mark: "nous", label: "Hermes" },
];

const SANDBOX_MARKS: ReadonlyArray<{ mark: Mark; label: string }> = [
	{ mark: "e2b", label: "E2B" },
	{ mark: "sprites", label: "Sprites" },
	{ mark: "vercel", label: "Vercel Sandbox" },
	{ mark: "dedalus", label: "Dedalus" },
];

const PIPELINE: ReadonlyArray<{
	icon?: ToolCategory;
	mark?: Mark;
	kicker: string;
	title: string;
	body: string;
	code: string;
}> = [
	{
		mark: "npm",
		kicker: "01",
		title: "Install the package",
		body: "One dependency. Substrate SDKs load lazily, only for routes you use.",
		code: INSTALL_CODE,
	},
	{
		icon: "filesystem",
		kicker: "02",
		title: "Drop in one JSON",
		body: "Keys and routes in agent-machines.json. Missing keys just narrow the route.",
		code: `{ "sandboxes": { "primary": "e2b", "backups": ["sprites"] } }`,
	},
	{
		icon: "delegate",
		kicker: "03",
		title: "Create with failover",
		body: "Primary first, backups on transient failure. Every attempt is recorded.",
		code: `mux.create({ agent, sandbox: "auto" })`,
	},
	{
		icon: "shell",
		kicker: "04",
		title: "Stream everything",
		body: "Normalized events from any agent, or a real PTY when you want a terminal.",
		code: "for await (const event of machine.run(prompt))",
	},
];

export function StatsRow() {
	return (
		<div className="overflow-hidden border-y border-[var(--ret-border)]">
			<div className="grid min-h-[600px] grid-cols-1 items-stretch gap-px border-b border-[var(--ret-border)] bg-[var(--ret-border)] lg:grid-cols-[minmax(420px,0.45fr)_minmax(0,0.55fr)] xl:grid-cols-[560px_minmax(0,1fr)]">
				<div className="relative flex flex-col justify-between overflow-hidden bg-[var(--ret-bg)] px-5 py-8 md:px-8 md:py-10 lg:px-10">
					<div
						aria-hidden="true"
						className="ret-circuit-texture pointer-events-none absolute inset-x-0 bottom-0 h-1/2 opacity-[0.10] mix-blend-multiply invert dark:opacity-[0.16] dark:mix-blend-screen dark:invert-0"
						style={{ "--ret-circuit-size": "360px 480px" } as CSSProperties}
					/>
					<div>
						<ReticleLabel>SDK</ReticleLabel>
						<h2 className="ret-display mt-3 max-w-[12ch] text-3xl tracking-tight md:text-5xl lg:text-[60px] lg:leading-[0.95]">
							Create the worker in code.
						</h2>
						<p className="mt-5 max-w-[54ch] text-[14px] leading-relaxed text-[var(--ret-text-dim)]">
							One typed client, two multiplexed planes. Pick the agent; the
							router places it on your primary sandbox and fails over to
							backups. Runs stream as normalized events, terminals attach as
							real PTYs.
						</p>
					</div>

					<div className="relative z-10 mt-8 grid gap-3">
						<div className="grid grid-cols-2 gap-px border border-[var(--ret-border)] bg-[var(--ret-border)]">
							<RouteFacet label="agent" value="Claude Code" mark="claudecode" />
							<RouteFacet label="route" value="e2b -> sprites" mark="e2b" />
							<RouteFacet label="events" value="Streamed" />
							<RouteFacet label="terminal" value="PTY" />
						</div>
						<div className="grid gap-px border border-[var(--ret-border)] bg-[var(--ret-border)]">
							{[
								"typed client",
								"harness x substrate route",
								"primary -> backup failover",
								"observable attempts",
							].map((item, index) => (
								<div
									key={item}
									className="grid grid-cols-[40px_minmax(0,1fr)] bg-[var(--ret-bg)] px-3 py-2.5 text-[12px]"
								>
									<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
										{String(index + 1).padStart(2, "0")}
									</span>
									<span className="font-medium text-[var(--ret-text)]">
										{item}
									</span>
								</div>
							))}
						</div>
					</div>
				</div>

				<div className="flex items-center bg-[var(--ret-bg)] p-4 md:p-7 lg:p-9">
					<CodePanel />
				</div>
			</div>

			<div className="grid grid-cols-1 gap-px border-b border-[var(--ret-border)] bg-[var(--ret-border)] lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.42fr)]">
				<div className="bg-[var(--ret-bg)] px-5 py-6 md:px-8">
					<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
						two planes, one route
					</span>
					<MuxDiagram className="mt-4" />
				</div>
				<div className="flex flex-col gap-6 bg-[var(--ret-bg)] px-5 py-6 md:px-8">
					<MarkStrip label="agents" entries={AGENT_MARKS} />
					<MarkStrip label="sandboxes" entries={SANDBOX_MARKS} />
					<p className="text-[12.5px] leading-relaxed text-[var(--ret-text-dim)]">
						Every agent installs through the substrate&apos;s own exec and PTY
						primitives, so a new sandbox inherits all four agents and a new
						agent inherits all four sandboxes.
					</p>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-px bg-[var(--ret-border)] md:grid-cols-2 xl:grid-cols-4">
				{PIPELINE.map((step) => (
					<PipelineCell key={step.kicker} step={step} />
				))}
			</div>
		</div>
	);
}

function RouteFacet({
	label,
	value,
	mark,
}: {
	label: string;
	value: string;
	mark?: Mark;
}) {
	return (
		<div className="bg-[var(--ret-bg)] px-3 py-3">
			<div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
				{label}
			</div>
			<div className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--ret-text)]">
				{mark ? <Logo mark={mark} size={13} /> : null}
				<span>{value}</span>
			</div>
		</div>
	);
}

function MarkStrip({
	label,
	entries,
}: {
	label: string;
	entries: ReadonlyArray<{ mark: Mark; label: string }>;
}) {
	return (
		<div className="flex flex-col gap-4 bg-[var(--ret-bg)] px-5 py-5 md:px-7">
			<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
				{label}
			</span>
			<div className="flex flex-wrap items-center gap-x-7 gap-y-3">
				{entries.map((entry) => (
					<span
						key={entry.mark}
						className="flex items-center gap-2 text-[12px] font-medium text-[var(--ret-text-dim)] transition-colors hover:text-[var(--ret-text)]"
					>
						<Logo mark={entry.mark} size={15} />
						{entry.label}
					</span>
				))}
			</div>
		</div>
	);
}

function CodePanel() {
	return (
		<div className="relative flex min-h-[440px] w-full flex-col overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-bg)] xl:min-h-[480px]">
			<div
				aria-hidden="true"
				className="ret-circuit-texture pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-multiply invert dark:opacity-[0.2] dark:mix-blend-screen dark:invert-0"
				style={{ "--ret-circuit-size": "320px 426px" } as CSSProperties}
			/>
			<div className="relative z-10 flex items-center justify-between border-b border-[var(--ret-border)] bg-[var(--ret-bg)]/86 px-3 py-2 backdrop-blur-sm">
				<div className="flex items-center gap-2">
					<ToolIcon name="code" size={13} className="text-[var(--ret-text-dim)]" />
					<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
						agent-machines.ts
					</span>
				</div>
				<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
					{"route -> machine -> stream"}
				</span>
			</div>
			<div className="relative z-10 flex justify-end border-b border-[var(--ret-border)] bg-[var(--ret-bg)]/78 px-3 py-2 backdrop-blur-sm">
				<CopyCodeButton text={CODE_TEXT} />
			</div>
			<pre className="relative z-10 m-0 flex-1 overflow-hidden bg-[var(--ret-bg)]/82 px-3 py-5 font-mono text-[12px] leading-6 text-[var(--ret-text)] backdrop-blur-sm md:px-6 md:py-6 md:text-[12.5px]">
				<code className="block">
					{CODE_LINES.map((line) => (
						<span key={line.no} className="block min-w-0 whitespace-pre-wrap break-words">
							<span className="mr-4 select-none text-[var(--ret-text-muted)]">
								{line.no}
							</span>
							<span aria-hidden="true">
								{"\t".repeat(line.indent ?? 0)}
							</span>
							{line.parts.map((part, i) => (
								<span key={`${line.no}-${i}`} className={codeTone(part.tone)}>
									{part.text}
								</span>
							))}
						</span>
					))}
				</code>
			</pre>
			<div className="relative z-10 grid grid-cols-3 gap-px border-t border-[var(--ret-border)] bg-[var(--ret-border)]">
				<CodeMeter label="keys" value="json / env" />
				<CodeMeter label="route" value="primary -> backups" />
				<CodeMeter label="stream" value="ndjson events" />
			</div>
		</div>
	);
}

function codeTone(tone: (typeof CODE_LINES)[number]["parts"][number]["tone"]) {
	return cn(
		tone === "boolean" && "font-semibold text-[var(--ret-text)]",
		tone === "class" && "font-semibold text-[var(--ret-text)]",
		tone === "comment" && "text-[var(--ret-text-muted)]",
		tone === "identifier" && "text-[var(--ret-text)]",
		tone === "keyword" && "font-semibold text-[var(--ret-text)]",
		tone === "method" && "font-medium text-[var(--ret-text)]",
		tone === "operator" && "text-[var(--ret-text-muted)]",
		tone === "property" && "text-[var(--ret-text-secondary)]",
		tone === "punctuation" && "text-[var(--ret-text-dim)]",
		tone === "string" && "text-[var(--ret-text-secondary)]",
	);
}

function CodeMeter({ label, value }: { label: string; value: string }) {
	return (
		<div className="bg-[var(--ret-bg)]/90 px-3 py-2 backdrop-blur-sm">
			<div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
				{label}
			</div>
			<div className="mt-1 font-mono text-[11px] text-[var(--ret-text)]">
				{value}
			</div>
		</div>
	);
}

function PipelineCell({ step }: { step: (typeof PIPELINE)[number] }) {
	return (
		<div className="group relative min-h-[250px] overflow-hidden bg-[var(--ret-bg)] p-5 transition-colors duration-300 [transition-timing-function:var(--ret-ease-out)] hover:bg-[var(--ret-bg-soft)] md:p-6">
			<div
				aria-hidden="true"
				className="ret-circuit-texture pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-0 mix-blend-multiply invert transition-opacity duration-200 group-hover:opacity-[0.12] dark:mix-blend-screen dark:invert-0 dark:group-hover:opacity-[0.2]"
				style={{ "--ret-circuit-size": "300px 400px" } as CSSProperties}
			/>
			<div className="relative z-10 mb-8 flex items-center justify-between">
				<div className="flex h-11 w-11 items-center justify-center border border-[var(--ret-border)] bg-[var(--ret-surface)] text-[var(--ret-text)] transition-transform duration-300 [transition-timing-function:var(--ret-ease-out)] group-hover:-translate-y-1">
					{step.mark ? (
						<Logo mark={step.mark} size={15} />
					) : step.icon ? (
						<ToolIcon name={step.icon} size={15} />
					) : null}
				</div>
				<span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--ret-text-muted)]">
					{step.kicker}
				</span>
			</div>
			<div className="relative z-10">
				<h3 className="text-[17px] font-semibold tracking-tight text-[var(--ret-text)]">
					{step.title}
				</h3>
				<p className="mt-2 text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
					{step.body}
				</p>
				<div className="mt-7 border border-[var(--ret-border)] bg-[var(--ret-surface)] px-3 py-2.5 font-mono text-[11px] text-[var(--ret-text-secondary)]">
					{step.code}
				</div>
			</div>
		</div>
	);
}
