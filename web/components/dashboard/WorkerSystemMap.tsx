import {
	ArrowRight,
	Box,
	Fingerprint,
	Layers3,
	ShieldCheck,
	Workflow,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
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
		<ReticleFrame className="overflow-hidden bg-[var(--ret-bg)]">
			<div className="grid gap-px bg-[var(--ret-border)] xl:grid-cols-12">
				<header className="relative overflow-hidden bg-[var(--ret-bg)] p-4 md:p-5 xl:col-span-5">
					<div
						className="pointer-events-none absolute inset-0 opacity-25"
						style={{
							backgroundImage:
								"linear-gradient(var(--ret-border) 1px, transparent 1px), linear-gradient(90deg, var(--ret-border) 1px, transparent 1px)",
							backgroundSize: "30px 30px",
							maskImage: "linear-gradient(120deg, transparent 10%, black 100%)",
						}}
					/>
					<div className="relative">
						<div className="flex items-center gap-2">
							<Fingerprint className="h-3.5 w-3.5 text-[var(--ret-purple)]" strokeWidth={1.6} />
							<ReticleLabel>PRODUCT MODEL</ReticleLabel>
						</div>
						<h2 className="ret-display mt-3 max-w-[18ch] text-2xl md:text-3xl">
							Keep the Worker. Change the machinery.
						</h2>
						<p className="mt-3 max-w-[58ch] text-[11.5px] leading-relaxed text-[var(--ret-text-dim)]">
							The Worker owns the job, memory, files, schedules, permissions, history, and evidence. Runtime, model, tools, storage, and sandbox remain replaceable.
						</p>
						<div className="mt-5 flex flex-wrap gap-1.5">
							{WORKER_SYSTEM.durable.map((item) => (
								<span key={item} className="border border-[var(--ret-border-hover)] bg-[var(--ret-bg-soft)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ret-text-dim)]">
									{item}
								</span>
							))}
						</div>
					</div>
				</header>

				<div className="bg-[var(--ret-bg-soft)] p-4 md:p-5 xl:col-span-7">
					<div className="mb-3 flex items-center justify-between gap-3">
						<ReticleLabel>RUNNING CROSS-SECTION</ReticleLabel>
						<ReticleBadge variant="default">one identity</ReticleBadge>
					</div>
					<DashboardArchitectureDiagram />
				</div>

				<div className="grid gap-px bg-[var(--ret-border)] md:grid-cols-3 xl:col-span-12">
					{PATHS.map((path, index) => (
						<Link key={path.label} href={path.href} className="group min-h-32 bg-[var(--ret-bg)] p-4 transition-colors hover:bg-[var(--ret-surface)]">
							<div className="flex items-center justify-between gap-3">
								<span className={`font-mono text-[9px] uppercase tracking-[0.16em] ${path.status === "live" ? "text-[var(--ret-green)]" : "text-[var(--ret-amber)]"}`}>
									{String(index + 1).padStart(2, "0")} · {path.status}
								</span>
								<ArrowRight className="h-3.5 w-3.5 text-[var(--ret-text-dim)] transition-transform group-hover:translate-x-0.5" />
							</div>
							<h3 className="mt-4 text-[12px] font-medium text-[var(--ret-text)]">{path.label}</h3>
							<p className="mt-1.5 max-w-[46ch] text-[9.5px] leading-relaxed text-[var(--ret-text-dim)]">{path.detail}</p>
						</Link>
					))}
				</div>
			</div>
		</ReticleFrame>
	);
}

function DashboardArchitectureDiagram() {
	return (
		<div className="grid gap-3 border border-[var(--ret-border)] bg-[var(--ret-bg)] p-3 sm:grid-cols-[0.8fr_1.2fr]">
			<div className="flex flex-col justify-center border border-[var(--ret-purple)] bg-[var(--ret-purple-glow)] p-4">
				<div className="flex items-center justify-between gap-3">
					<Fingerprint className="h-5 w-5 text-[var(--ret-purple)]" strokeWidth={1.4} />
					<ShieldCheck className="h-4 w-4 text-[var(--ret-green)]" strokeWidth={1.4} />
				</div>
				<strong className="mt-4 text-base text-[var(--ret-text)]">Worker</strong>
				<p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ret-text-dim)]">stable control object</p>
			</div>
			<div className="relative grid gap-1.5">
				<StackLayer icon={<Workflow className="h-3.5 w-3.5" />} label="Runtime" value="Claude · Codex · Hermes · OpenClaw" active />
				<StackLayer icon={<Layers3 className="h-3.5 w-3.5" />} label="Model and abilities" value="native · router · skills · MCP" />
				<StackLayer icon={<Box className="h-3.5 w-3.5" />} label="Sandbox and storage" value="E2B · Sprites · Vercel · Daytona" />
				<span className="pointer-events-none absolute -left-2 top-1/2 h-px w-2 bg-[var(--ret-purple)]" aria-hidden="true" />
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
		<div className={`flex items-center gap-3 border p-2.5 ${active ? "border-[var(--ret-purple)] bg-[var(--ret-purple-glow)]" : "border-[var(--ret-border)] bg-[var(--ret-bg-soft)]"}`}>
			<span className="text-[var(--ret-purple)]">{icon}</span>
			<div className="min-w-0">
				<p className="text-[10px] font-medium text-[var(--ret-text)]">{label}</p>
				<p className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ret-text-muted)]">{value}</p>
			</div>
		</div>
	);
}
