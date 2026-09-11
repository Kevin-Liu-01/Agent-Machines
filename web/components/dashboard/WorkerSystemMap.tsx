import {
	ArrowRight,
	Box,
	ChevronDown,
	Layers3,
	Settings2,
	Workflow,
} from "@/components/ui/icons";
import Link from "next/link";
import type { ReactNode } from "react";

import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { cn } from "@/lib/cn";

const PATHS = [
	{
		label: "Use a template",
		detail: "Inspect starting instructions and selected tools, then customize them.",
		href: "/dashboard/agents",
	},
	{
		label: "Choose runtime and compute",
		detail: "Connect your accounts, pick a runtime, and launch a workspace below.",
		href: "#launch-worker",
	},
	{
		label: "Browse building blocks",
		detail: "Inspect each component's source and open its configuration controls.",
		href: "/dashboard/components",
	},
] as const;

export function WorkerSystemMap() {
	return (
		<ReticleFrame className={cn("overflow-hidden bg-[var(--ret-bg)]")}>
			<header className={cn("border-b border-[var(--ret-border)] px-4 py-4 sm:px-5")}>
				<h2 className={cn("text-xl font-medium tracking-tight text-[var(--ret-text)]")}>Start with parts you can inspect</h2>
				<p className={cn("mt-1 text-[16px] leading-relaxed text-[var(--ret-text-dim)]")}>
					Open-source building blocks for agent harnesses, with browser and CLI access to the same fleet.
				</p>
			</header>
				<div className={cn("grid gap-px bg-[var(--ret-border)] md:grid-cols-3")}>
					{PATHS.map((path, index) => (
						<Link key={path.label} href={path.href} className={cn("group min-w-0 bg-[var(--ret-bg)] p-4 outline-none hover:bg-[var(--ret-surface)] active:bg-[var(--ret-bg-soft)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ret-purple)] sm:px-5")}>
							<div className={cn("flex items-center justify-between gap-3")}>
								<span className={cn("text-[13px] font-medium text-[var(--ret-text-muted)]")}>
									{String(index + 1).padStart(2, "0")}
								</span>
								<ArrowRight aria-hidden="true" className={cn("h-5 w-5 shrink-0 text-[var(--ret-text-muted)] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] pointer-fine:motion-safe:[@media(hover:hover)]:group-[:hover:not(:disabled):not(:focus-visible)]:translate-x-0.5 group-focus-visible:transition-none")} strokeWidth={1.75} />
							</div>
							<h3 className={cn("mt-3 text-[18px] font-medium text-[var(--ret-text)]")}>{path.label}</h3>
							<p className={cn("mt-1 max-w-[46ch] text-[16px] leading-relaxed text-[var(--ret-text-dim)]")}>{path.detail}</p>
						</Link>
					))}
				</div>
			<details className={cn("group/model border-t border-[var(--ret-border)]")}>
				<summary className={cn("flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-[16px] text-[var(--ret-text-dim)] outline-none hover:text-[var(--ret-text)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ret-purple)] sm:px-5 [&::-webkit-details-marker]:hidden")}>
					<Settings2 aria-hidden="true" className={cn("h-4 w-4 shrink-0 text-[var(--ret-purple)]")} strokeWidth={1.75} />
					What makes up an agent setup?
					<ChevronDown aria-hidden="true" className={cn("ml-auto h-4 w-4 group-open/model:rotate-180")} strokeWidth={1.75} />
				</summary>
				<div className={cn("grid gap-4 border-t border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-4 sm:p-5 lg:grid-cols-2")}>
					<div>
						<h3 className={cn("text-[18px] font-medium text-[var(--ret-text)]")}>Configure each layer</h3>
						<p className={cn("mt-2 max-w-[62ch] text-[16px] leading-relaxed text-[var(--ret-text-dim)]")}>
							A Worker is the saved record for your configured workspace. Choose its runtime, connect a model, and edit its memory and tool loadout. Launch it on a supported compute provider when you are ready.
						</p>
						<p className={cn("mt-3 text-[14px] leading-relaxed text-[var(--ret-text-muted)]")}>Runtime tools and provider persistence differ. Moving files does not transfer running processes or translate runtime-specific memory.</p>
					</div>
					<div>
						<div className={cn("mb-3 flex items-center justify-between gap-3")}>
							<h3 className={cn("text-[16px] font-medium text-[var(--ret-text)]")}>Setup layers</h3>
						</div>
						<DashboardArchitectureDiagram />
					</div>
				</div>
			</details>
		</ReticleFrame>
	);
}

function DashboardArchitectureDiagram() {
	return (
		<div className={cn("grid gap-3 border border-[var(--ret-border)] bg-[var(--ret-bg)] p-3 sm:grid-cols-[0.8fr_1.2fr]")}>
			<div className={cn("flex flex-col justify-center border border-[var(--ret-purple)] bg-[var(--ret-purple-glow)] p-4")}>
				<div className={cn("flex items-center justify-between gap-3")}>
					<Settings2 aria-hidden="true" className={cn("h-5 w-5 text-[var(--ret-purple)]")} strokeWidth={1.4} />
				</div>
				<strong className={cn("mt-4 text-base text-[var(--ret-text)]")}>Your setup</strong>
				<p className={cn("mt-1 text-[13px] text-[var(--ret-text-dim)]")}>configuration you control</p>
			</div>
			<div className={cn("relative grid gap-1.5")}>
				<StackLayer icon={<Workflow aria-hidden="true" className={cn("h-4 w-4")} />} label="Runtime" value="Claude Code · Codex · Hermes · OpenClaw" active />
				<StackLayer icon={<Layers3 aria-hidden="true" className={cn("h-4 w-4")} />} label="Model, memory, and tools" value="credentials · instructions · skills · MCP" />
				<StackLayer icon={<Box aria-hidden="true" className={cn("h-4 w-4")} />} label="Compute and storage" value="E2B · Sprites · Vercel · Daytona" />
				<span className={cn("pointer-events-none absolute -left-2 top-1/2 h-px w-2 bg-[var(--ret-purple)]")} aria-hidden="true" />
			</div>
		</div>
	);
}

function StackLayer({
	icon,
	label,
	value,
	active = false,
}: {
	icon: ReactNode;
	label: string;
	value: string;
	active?: boolean;
}) {
	return (
		<div className={cn(`flex items-center gap-3 border p-2.5 ${active ? "border-[var(--ret-purple)] bg-[var(--ret-purple-glow)]" : "border-[var(--ret-border)] bg-[var(--ret-bg-soft)]"}`)}>
			<span className={cn("text-[var(--ret-purple)]")}>{icon}</span>
			<div className={cn("min-w-0")}>
				<p className={cn("text-[14px] font-medium text-[var(--ret-text)]")}>{label}</p>
				<p className={cn("mt-0.5 text-[13px] leading-relaxed text-[var(--ret-text-muted)]")}>{value}</p>
			</div>
		</div>
	);
}
