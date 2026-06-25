"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";

import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ToolIcon } from "@/components/ToolIcon";
import type { ToolCategory } from "@/lib/dashboard/loadout";
import { cn } from "@/lib/cn";

const INSTALL_CODE = "npm i agent-machines";

const CODE_TEXT = `import { AgentMachines } from "agent-machines"

const am = new AgentMachines()

const agent = await am.create({
  agent: "hermes",
  sandbox: "e2b",
  model: "claude-opus-4.8",
  persistent: true,
})

await agent.run("review my code")`;

type CodeTone =
	| "boolean"
	| "class"
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
			{ text: " AgentMachines ", tone: "class" },
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
			{ text: " am", tone: "identifier" },
			{ text: " = ", tone: "operator" },
			{ text: "new", tone: "keyword" },
			{ text: " AgentMachines", tone: "class" },
			{ text: "()", tone: "punctuation" },
		],
	},
	{ no: "04", parts: [{ text: "" }] },
	{
		no: "05",
		parts: [
			{ text: "const", tone: "keyword" },
			{ text: " agent", tone: "identifier" },
			{ text: " = ", tone: "operator" },
			{ text: "await", tone: "keyword" },
			{ text: " am", tone: "identifier" },
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
			{ text: "\"hermes\"", tone: "string" },
			{ text: ",", tone: "punctuation" },
		],
	},
	{
		no: "07",
		indent: 1,
		parts: [
			{ text: "sandbox", tone: "property" },
			{ text: ": ", tone: "punctuation" },
			{ text: "\"e2b\"", tone: "string" },
			{ text: ",", tone: "punctuation" },
		],
	},
	{
		no: "08",
		indent: 1,
		parts: [
			{ text: "model", tone: "property" },
			{ text: ": ", tone: "punctuation" },
			{ text: "\"claude-opus-4.8\"", tone: "string" },
			{ text: ",", tone: "punctuation" },
		],
	},
	{
		no: "09",
		indent: 1,
		parts: [
			{ text: "persistent", tone: "property" },
			{ text: ": ", tone: "punctuation" },
			{ text: "true", tone: "boolean" },
			{ text: ",", tone: "punctuation" },
		],
	},
	{ no: "10", parts: [{ text: "})", tone: "punctuation" }] },
	{ no: "11", parts: [{ text: "" }] },
	{
		no: "12",
		parts: [
			{ text: "await", tone: "keyword" },
			{ text: " agent", tone: "identifier" },
			{ text: ".run", tone: "method" },
			{ text: "(", tone: "punctuation" },
			{ text: "\"review my code\"", tone: "string" },
			{ text: ")", tone: "punctuation" },
		],
	},
];

const READOUTS: ReadonlyArray<{
	label: string;
	value: string;
	icon: ToolCategory;
}> = [
	{
		label: "package",
		value: "install",
		icon: "code",
	},
	{
		label: "recipe",
		value: "compose",
		icon: "delegate",
	},
	{
		label: "model",
		value: "normalize",
		icon: "memory",
	},
	{
		label: "state",
		value: "persist",
		icon: "filesystem",
	},
	{
		label: "run",
		value: "run",
		icon: "shell",
	},
	{
		label: "proof",
		value: "observe",
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
							Create a persistent worker with one typed recipe. Choose the
							agent, substrate, model, and state policy. The control plane
							handles boot, gateway, logs, and usage.
						</p>
					</div>

					<div className="relative z-10 mt-8 grid gap-3">
						<div className="grid grid-cols-2 gap-px border border-[var(--ret-border)] bg-[var(--ret-border)]">
							<RouteFacet label="agent" value="Hermes" />
							<RouteFacet label="substrate" value="E2B" />
							<RouteFacet label="model" value="Opus 4.8" />
							<RouteFacet label="state" value="Persistent" />
						</div>
						<div className="grid gap-px border border-[var(--ret-border)] bg-[var(--ret-border)]">
							{["typed client", "agent + substrate", "server-normalized model", "observable run"].map((item, index) => (
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

			<div className="grid grid-cols-1 gap-px border-b border-[var(--ret-border)] bg-[var(--ret-border)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
				{READOUTS.map((spec) => (
					<ReadoutCell key={spec.label} spec={spec} />
				))}
			</div>

			<div className="grid grid-cols-1 gap-px bg-[var(--ret-border)] md:grid-cols-2 xl:grid-cols-4">
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
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timeout = window.setTimeout(() => setCopied(false), 1400);
		return () => window.clearTimeout(timeout);
	}, [copied]);

	const copyCode = async () => {
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(CODE_TEXT);
			} else {
				const textarea = document.createElement("textarea");
				textarea.value = CODE_TEXT;
				textarea.setAttribute("readonly", "");
				textarea.style.position = "fixed";
				textarea.style.top = "-9999px";
				document.body.appendChild(textarea);
				textarea.select();
				document.execCommand("copy");
				document.body.removeChild(textarea);
			}
			setCopied(true);
		} catch {
			setCopied(false);
		}
	};

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
					{"recipe -> worker"}
				</span>
			</div>
			<div className="relative z-10 flex justify-end border-b border-[var(--ret-border)] bg-[var(--ret-bg)]/78 px-3 py-2 backdrop-blur-sm">
				<button
					type="button"
					onClick={() => void copyCode()}
					className="ret-pressable inline-flex min-h-8 items-center gap-1.5 border border-[var(--ret-border)] bg-[var(--ret-surface)] px-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-text-secondary)] hover:border-[var(--ret-border-hover)] hover:bg-[var(--ret-surface-hover)] hover:text-[var(--ret-text)]"
					aria-label={copied ? "SDK example copied" : "Copy SDK example"}
				>
					{copied ? (
						<Check className="h-3.5 w-3.5" strokeWidth={1.75} />
					) : (
						<Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
					)}
					<span>{copied ? "copied" : "copy"}</span>
				</button>
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
				<CodeMeter label="auth" value="bearer" />
				<CodeMeter label="boot" value="phased" />
				<CodeMeter label="logs" value="attached" />
			</div>
		</div>
	);
}

function codeTone(tone: (typeof CODE_LINES)[number]["parts"][number]["tone"]) {
	return cn(
		tone === "boolean" && "font-semibold text-[var(--ret-text)]",
		tone === "class" && "font-semibold text-[var(--ret-text)]",
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

function ReadoutCell({ spec }: { spec: (typeof READOUTS)[number] }) {
	return (
		<div className="group relative min-h-[168px] overflow-hidden bg-[var(--ret-bg)] transition-colors duration-300 [transition-timing-function:var(--ret-ease-out)] hover:bg-[var(--ret-bg-soft)]">
			<div
				aria-hidden="true"
				className="ret-circuit-texture pointer-events-none absolute inset-0 opacity-[0.08] mix-blend-multiply invert transition-opacity duration-300 group-hover:opacity-[0.16] dark:opacity-[0.12] dark:mix-blend-screen dark:invert-0 dark:group-hover:opacity-[0.22]"
				style={{ "--ret-circuit-size": "260px 340px" } as CSSProperties}
			/>
			<div className="absolute left-4 top-4 z-10 flex items-center gap-1.5">
				<ToolIcon name={spec.icon} size={11} className="text-[var(--ret-text-muted)]" />
				<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{spec.label}
				</span>
			</div>
			<ReadoutVisual index={READOUTS.indexOf(spec)} />
			<span className="absolute bottom-4 right-4 z-10 text-right text-[22px] font-semibold leading-none tracking-tight text-[var(--ret-text)]">
				{spec.value}
			</span>
		</div>
	);
}

function ReadoutVisual({ index }: { index: number }) {
	const variant = index % 6;
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 220 132"
			className="absolute inset-x-3 top-8 h-[112px] w-[calc(100%-1.5rem)] text-[var(--ret-text-secondary)] opacity-55 transition-[opacity,transform] duration-300 [transition-timing-function:var(--ret-ease-out)] group-hover:translate-y-[-2px] group-hover:opacity-80"
			fill="none"
		>
			<path
				d="M8 68h44l18-18h40l20 20h82"
				stroke="currentColor"
				strokeWidth="1"
				opacity=".42"
				vectorEffect="non-scaling-stroke"
			/>
			{variant === 0 ? (
				<>
					<rect x="58" y="30" width="104" height="58" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
					<path d="M74 48h72M74 64h44M74 80h62" stroke="currentColor" strokeWidth="1" opacity=".72" vectorEffect="non-scaling-stroke" />
					<path d="M42 102h96l18-18h28" stroke="currentColor" strokeWidth="1" opacity=".34" vectorEffect="non-scaling-stroke" />
				</>
			) : null}
			{variant === 1 ? (
				<>
					<circle cx="70" cy="44" r="10" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
					<circle cx="146" cy="44" r="10" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
					<circle cx="108" cy="88" r="12" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
					<path d="M80 48l18 26M136 50l-18 24M82 44h54" stroke="currentColor" strokeWidth="1" opacity=".72" vectorEffect="non-scaling-stroke" />
				</>
			) : null}
			{variant === 2 ? (
				<>
					<path d="M46 38h126M46 62h88M46 86h126" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
					<path d="M170 38l18 24-18 24" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
					<circle cx="46" cy="62" r="5" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
				</>
			) : null}
			{variant === 3 ? (
				<>
					<rect x="62" y="32" width="96" height="64" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
					<path d="M78 32v-14M96 32v-14M124 96v18M142 96v18M48 52h14M158 76h18" stroke="currentColor" strokeWidth="1" opacity=".75" vectorEffect="non-scaling-stroke" />
					<path d="M86 64h48" stroke="currentColor" strokeWidth="1.2" opacity=".55" vectorEffect="non-scaling-stroke" />
				</>
			) : null}
			{variant === 4 ? (
				<>
					<path d="M48 42h72l34 34h28" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
					<path d="M48 80h52" stroke="currentColor" strokeWidth="1.2" opacity=".48" vectorEffect="non-scaling-stroke" />
					<path d="M106 72l12 8-12 8" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
					<circle cx="182" cy="76" r="8" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
				</>
			) : null}
			{variant === 5 ? (
				<>
					<path d="M42 82c18-28 31-28 48 0s30 28 48 0 30-28 48 0" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
					<path d="M42 42h144M42 108h144" stroke="currentColor" strokeWidth="1" opacity=".32" vectorEffect="non-scaling-stroke" />
					<circle cx="90" cy="82" r="4" fill="currentColor" opacity=".75" />
					<circle cx="138" cy="82" r="4" fill="currentColor" opacity=".75" />
				</>
			) : null}
		</svg>
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
					<ToolIcon name={step.icon} size={15} />
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
