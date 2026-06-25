import type { CSSProperties } from "react";

import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ToolIcon } from "@/components/ToolIcon";
import type { ToolCategory } from "@/lib/dashboard/loadout";
import { cn } from "@/lib/cn";

const INSTALL_CODE = "npm i agent-machines";

const CODE_LINES: ReadonlyArray<{
	no: string;
	indent?: number;
	parts: ReadonlyArray<{ text: string; tone?: "dim" | "keyword" | "string" }>;
}> = [
	{
		no: "01",
		parts: [
			{ text: "import", tone: "keyword" },
			{ text: " { AgentMachines } " },
			{ text: "from", tone: "keyword" },
			{ text: " \"agent-machines\"", tone: "string" },
		],
	},
	{ no: "02", parts: [{ text: "" }] },
	{
		no: "03",
		parts: [
			{ text: "const", tone: "keyword" },
			{ text: " am = " },
			{ text: "new", tone: "keyword" },
			{ text: " AgentMachines()" },
		],
	},
	{ no: "04", parts: [{ text: "" }] },
	{
		no: "05",
		parts: [
			{ text: "const", tone: "keyword" },
			{ text: " agent = " },
			{ text: "await", tone: "keyword" },
			{ text: " am.create({" },
		],
	},
	{
		no: "06",
		indent: 1,
		parts: [
			{ text: "agent: " },
			{ text: "\"hermes\"", tone: "string" },
			{ text: "," },
		],
	},
	{
		no: "07",
		indent: 1,
		parts: [
			{ text: "sandbox: " },
			{ text: "\"e2b\"", tone: "string" },
			{ text: "," },
		],
	},
	{
		no: "08",
		indent: 1,
		parts: [
			{ text: "model: " },
			{ text: "\"claude-opus-4.8\"", tone: "string" },
			{ text: "," },
		],
	},
	{
		no: "09",
		indent: 1,
		parts: [{ text: "persistent: true," }],
	},
	{ no: "10", parts: [{ text: "})" }] },
	{ no: "11", parts: [{ text: "" }] },
	{
		no: "12",
		parts: [
			{ text: "await", tone: "keyword" },
			{ text: " agent.run(" },
			{ text: "\"review my code\"", tone: "string" },
			{ text: ")" },
		],
	},
];

const READOUTS: ReadonlyArray<{
	label: string;
	value: string;
	description: string;
	icon: ToolCategory;
}> = [
	{
		label: "package",
		value: "1 install",
		description: "A typed client for the worker.",
		icon: "code",
	},
	{
		label: "recipe",
		value: "agent + box",
		description: "Runtime and sandbox stay separate.",
		icon: "delegate",
	},
	{
		label: "model",
		value: "alias-safe",
		description: "Short names normalize server-side.",
		icon: "memory",
	},
	{
		label: "state",
		value: "persistent",
		description: "The worker survives the prompt.",
		icon: "filesystem",
	},
	{
		label: "run",
		value: "one call",
		description: "Gateway first, command fallback.",
		icon: "shell",
	},
	{
		label: "proof",
		value: "observable",
		description: "Logs and usage stay attached.",
		icon: "search",
	},
];

const PIPELINE: ReadonlyArray<{
	icon: ToolCategory;
	kicker: string;
	title: string;
	body: string;
	code: string;
}> = [
	{
		icon: "code",
		kicker: "01",
		title: "Import the client",
		body: "Use the SDK from any server.",
		code: INSTALL_CODE,
	},
	{
		icon: "delegate",
		kicker: "02",
		title: "Shape the worker",
		body: "Pick runtime, substrate, and model.",
		code: "am.create({ agent, sandbox, model })",
	},
	{
		icon: "filesystem",
		kicker: "03",
		title: "Keep the worker",
		body: "Persist files, skills, and memory.",
		code: "persistent: true",
	},
	{
		icon: "shell",
		kicker: "04",
		title: "Run real work",
		body: "Send the prompt when ready.",
		code: "await agent.run(prompt)",
	},
];

export function StatsRow() {
	return (
		<div>
			<div className="grid grid-cols-1 items-stretch gap-px border-b border-[var(--ret-border)] bg-[var(--ret-border)] lg:grid-cols-[0.82fr_1.18fr]">
				<div className="flex flex-col justify-between bg-[var(--ret-bg)] px-4 py-8 md:px-6 md:py-12">
					<div>
						<ReticleLabel>SDK</ReticleLabel>
						<h2 className="ret-display mt-3 max-w-[18ch] text-2xl tracking-tight md:text-4xl">
							Create the worker in code.
						</h2>
						<p className="mt-4 max-w-[54ch] text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
							Agent Machines turns a small worker recipe into a persistent agent
							worker. Pick the runtime, sandbox, model, and state policy. The
							control plane handles boot, gateway, logs, and usage.
						</p>
					</div>

					<div className="mt-8 grid grid-cols-1 gap-px border border-[var(--ret-border)] bg-[var(--ret-border)] sm:grid-cols-3">
						<RouteFacet label="agent" value="Hermes" />
						<RouteFacet label="sandbox" value="E2B" />
						<RouteFacet label="model" value="Opus 4.8" />
					</div>
				</div>

				<div className="bg-[var(--ret-bg)] p-4 md:p-6">
					<CodePanel />
				</div>
			</div>

			<div className="grid grid-cols-2 gap-px border-b border-[var(--ret-border)] bg-[var(--ret-border)] sm:grid-cols-3 lg:grid-cols-6">
				{READOUTS.map((spec) => (
					<ReadoutCell key={spec.label} spec={spec} />
				))}
			</div>

			<div className="grid grid-cols-1 gap-px bg-[var(--ret-border)] md:grid-cols-4">
				{PIPELINE.map((step) => (
					<PipelineCell key={step.kicker} step={step} />
				))}
			</div>
		</div>
	);
}

function RouteFacet({ label, value }: { label: string; value: string }) {
	return (
		<div className="bg-[var(--ret-bg)] px-3 py-3">
			<div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
				{label}
			</div>
			<div className="mt-1 text-[13px] font-semibold text-[var(--ret-text)]">
				{value}
			</div>
		</div>
	);
}

function CodePanel() {
	return (
		<div className="relative overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-bg)]">
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
					{"recipe -> worker"}
				</span>
			</div>
			<pre className="relative z-10 m-0 overflow-hidden bg-[var(--ret-bg)]/82 px-3 py-4 font-mono text-[11px] leading-6 text-[var(--ret-text)] backdrop-blur-sm md:px-5 md:py-5 md:text-[12px]">
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
				<CodeMeter label="auth" value="bearer" />
				<CodeMeter label="boot" value="phased" />
				<CodeMeter label="logs" value="attached" />
			</div>
		</div>
	);
}

function codeTone(tone: (typeof CODE_LINES)[number]["parts"][number]["tone"]) {
	return cn(
		tone === "dim" && "text-[var(--ret-text-muted)]",
		tone === "keyword" && "font-semibold text-[var(--ret-text)]",
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

function ReadoutCell({ spec }: { spec: (typeof READOUTS)[number] }) {
	return (
		<div className="flex min-h-[118px] flex-col gap-1 bg-[var(--ret-bg)] px-4 py-5">
			<div className="flex items-center gap-1.5">
				<ToolIcon name={spec.icon} size={11} className="text-[var(--ret-text-muted)]" />
				<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{spec.label}
				</span>
			</div>
			<span className="mt-1 text-[20px] font-semibold leading-none tabular-nums tracking-tight text-[var(--ret-text)]">
				{spec.value}
			</span>
			<span className="text-[11px] leading-snug text-[var(--ret-text-dim)]">
				{spec.description}
			</span>
		</div>
	);
}

function PipelineCell({ step }: { step: (typeof PIPELINE)[number] }) {
	return (
		<div className="group relative min-h-[210px] overflow-hidden bg-[var(--ret-bg)] p-5 transition-colors duration-150 hover:bg-[var(--ret-bg-soft)] md:p-6">
			<div
				aria-hidden="true"
				className="ret-circuit-texture pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-0 mix-blend-multiply invert transition-opacity duration-200 group-hover:opacity-[0.12] dark:mix-blend-screen dark:invert-0 dark:group-hover:opacity-[0.2]"
				style={{ "--ret-circuit-size": "300px 400px" } as CSSProperties}
			/>
			<div className="relative z-10 mb-5 flex items-center justify-between">
				<div className="flex h-9 w-9 items-center justify-center border border-[var(--ret-border)] bg-[var(--ret-surface)] text-[var(--ret-text)] transition-transform duration-150 ease-[var(--ret-ease-out)] group-hover:-translate-y-0.5">
					<ToolIcon name={step.icon} size={15} />
				</div>
				<span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--ret-text-muted)]">
					{step.kicker}
				</span>
			</div>
			<div className="relative z-10">
				<h3 className="text-[15px] font-semibold tracking-tight text-[var(--ret-text)]">
					{step.title}
				</h3>
				<p className="mt-1.5 text-[12px] leading-relaxed text-[var(--ret-text-dim)]">
					{step.body}
				</p>
				<div className="mt-5 border border-[var(--ret-border)] bg-[var(--ret-surface)] px-3 py-2 font-mono text-[11px] text-[var(--ret-text-secondary)]">
					{step.code}
				</div>
			</div>
		</div>
	);
}
