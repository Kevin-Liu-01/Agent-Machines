import {
	ArrowRight,
	Box,
	ChevronDown,
	Fingerprint,
	Layers3,
	ShieldCheck,
	Workflow,
} from "@/components/ui/icons";
import Link from "next/link";
import type { ReactNode } from "react";

import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { cn } from "@/lib/cn";
import { WORKER_SYSTEM } from "@/lib/product/worker-system";

const PATHS = [
	{
		label: "Use a template",
		detail: "Start with a tested role, memory bundle, abilities, and runtime.",
		href: "/dashboard/agents",
		status: "live",
	},
	{
		label: "Build the stack",
		detail: "Choose the runtime and sandbox, then create the Worker.",
		href: "#launch-worker",
		status: "live",
	},
	{
		label: "Describe the job",
		detail: "Generate a proposed role, schedule, permissions, and placement.",
		href: "/docs",
		status: "planned",
	},
] as const;

export function WorkerSystemMap() {
	return (
		<ReticleFrame className={cn("overflow-hidden bg-[var(--ret-bg)]")}>
			<header className={cn("border-b border-[var(--ret-border)] px-4 py-4 sm:px-5")}>
				<h2 className={cn("text-xl font-medium tracking-tight text-[var(--ret-text)]")}>Start a Worker</h2>
				<p className={cn("mt-1 text-[16px] leading-relaxed text-[var(--ret-text-dim)]")}>
					Choose a template or assemble a runtime and sandbox below.
				</p>
			</header>
				<div className={cn("grid gap-px bg-[var(--ret-border)] md:grid-cols-3")}>
					{PATHS.map((path, index) => (
						<Link key={path.label} href={path.href} className={cn("group min-w-0 bg-[var(--ret-bg)] p-4 outline-none hover:bg-[var(--ret-surface)] active:bg-[var(--ret-bg-soft)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ret-purple)] sm:px-5")}>
							<div className={cn("flex items-center justify-between gap-3")}>
								<span className={cn(`text-[13px] font-medium ${path.status === "live" ? "text-[var(--ret-green)]" : "text-[var(--ret-amber)]"}`)}>
									{String(index + 1).padStart(2, "0")} · {path.status === "live" ? "Available" : "Planned"}
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
					<Fingerprint aria-hidden="true" className={cn("h-4 w-4 shrink-0 text-[var(--ret-purple)]")} strokeWidth={1.75} />
					How Workers are organized
					<ChevronDown aria-hidden="true" className={cn("ml-auto h-4 w-4 group-open/model:rotate-180")} strokeWidth={1.75} />
				</summary>
				<div className={cn("grid gap-4 border-t border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-4 sm:p-5 lg:grid-cols-2")}>
					<div>
						<h3 className={cn("text-[18px] font-medium text-[var(--ret-text)]")}>Keep the Worker. Change the machinery.</h3>
						<p className={cn("mt-2 max-w-[62ch] text-[16px] leading-relaxed text-[var(--ret-text-dim)]")}>
							The Worker owns the job, memory, files, schedules, permissions, history, and evidence. Runtime, model, tools, storage, and sandbox remain replaceable.
						</p>
						<p className={cn("mt-3 text-[13px] leading-relaxed text-[var(--ret-text-muted)]")}>{WORKER_SYSTEM.durable.join(" · ")}</p>
					</div>
					<div>
						<div className={cn("mb-3 flex items-center justify-between gap-3")}>
							<h3 className={cn("text-[16px] font-medium text-[var(--ret-text)]")}>Worker architecture</h3>
							<ReticleBadge variant="default">One identity</ReticleBadge>
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
					<Fingerprint className={cn("h-5 w-5 text-[var(--ret-purple)]")} strokeWidth={1.4} />
					<ShieldCheck className={cn("h-4 w-4 text-[var(--ret-green)]")} strokeWidth={1.4} />
				</div>
				<strong className={cn("mt-4 text-base text-[var(--ret-text)]")}>Worker</strong>
				<p className={cn("mt-1 text-[13px] text-[var(--ret-text-dim)]")}>stable control object</p>
			</div>
			<div className={cn("relative grid gap-1.5")}>
				<StackLayer icon={<Workflow className={cn("h-4 w-4")} />} label="Runtime" value="Claude · Codex · Hermes · OpenClaw" active />
				<StackLayer icon={<Layers3 className={cn("h-4 w-4")} />} label="Model and abilities" value="native · router · skills · MCP" />
				<StackLayer icon={<Box className={cn("h-4 w-4")} />} label="Sandbox and storage" value="E2B · Sprites · Vercel · Daytona" />
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
