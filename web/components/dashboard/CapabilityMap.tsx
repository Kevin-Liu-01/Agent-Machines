import Link from "next/link";
import {
	Activity,
	ArrowUpRight,
	BarChart3,
	Bot,
	Brain,
	Clock3,
	CloudCog,
	FileOutput,
	Gauge,
	History,
	MessagesSquare,
	PackageOpen,
	Plug2,
	Route,
	Search,
	ServerCog,
	KeyRound,
	Settings2,
	Sparkles,
	SquareTerminal,
	type LucideIcon,
} from "lucide-react";

import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import {
	DASHBOARD_CAPABILITIES,
	DASHBOARD_CAPABILITY_GROUPS,
} from "@/lib/dashboard/capabilities";

const ICONS: Record<string, LucideIcon> = {
	"agent-templates": Bot,
	"provider-routing": CloudCog,
	memory: Brain,
	"model-paths": Settings2,
	machines: ServerCog,
	console: MessagesSquare,
	terminal: SquareTerminal,
	migration: Route,
	logs: Activity,
	sessions: History,
	usage: BarChart3,
	artifacts: FileOutput,
	cron: Clock3,
	loadout: PackageOpen,
	skills: Sparkles,
	mcps: Plug2,
	benchmarks: Gauge,
	registry: Search,
	"api-access": KeyRound,
};

export function CapabilityMap({ hasMachine }: { hasMachine: boolean }) {
	return (
		<section aria-labelledby="capability-map-title" className="space-y-3">
			<div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--ret-border)] pb-3">
				<div>
					<p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ret-purple)]">
						product map
					</p>
					<h2 id="capability-map-title" className="ret-display mt-1 text-lg">
						The Worker's control surface
					</h2>
					<p className="mt-1 max-w-[72ch] text-[12px] text-[var(--ret-text-dim)]">
						These are the working abilities around a durable Worker: compose it, operate it, inspect its evidence, and extend it. Provider-dependent controls only appear when the selected sandbox supports them.
					</p>
				</div>
				<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{DASHBOARD_CAPABILITIES.length} operational surfaces
				</span>
			</div>

			<div className="grid gap-3 xl:grid-cols-2">
				{DASHBOARD_CAPABILITY_GROUPS.map((group) => {
					const capabilities = DASHBOARD_CAPABILITIES.filter((item) => item.group === group.id);
					return (
						<ReticleFrame key={group.id} corners={false} className="overflow-hidden">
							<div className="flex items-baseline justify-between gap-3 border-b border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-2.5">
								<h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text)]">{group.label}</h3>
								<p className="text-[10px] italic text-[var(--ret-text-muted)]">{group.description}</p>
							</div>
							<div className="grid sm:grid-cols-2">
								{capabilities.map((capability, index) => {
									const Icon = ICONS[capability.id] ?? PackageOpen;
									const waiting = capability.requiresMachine && !hasMachine;
									return (
										<Link
											key={capability.id}
											href={capability.href}
											className={`group relative min-h-32 border-[var(--ret-border)] p-3 transition-colors hover:bg-[var(--ret-surface)] ${index % 2 === 0 ? "sm:border-r" : ""} ${index < capabilities.length - 2 ? "border-b" : index === capabilities.length - 2 && capabilities.length % 2 === 0 ? "border-b sm:border-b-0" : ""}`}
										>
											<div className="flex items-start justify-between gap-3">
												<span className="flex h-7 w-7 items-center justify-center border border-[var(--ret-border)] bg-[var(--ret-bg)] text-[var(--ret-purple)]">
													<Icon size={14} strokeWidth={1.65} />
												</span>
												<ArrowUpRight size={13} className="text-[var(--ret-text-muted)] transition-colors group-hover:text-[var(--ret-purple)]" />
											</div>
											<h4 className="mt-2 text-[12px] font-medium text-[var(--ret-text)]">{capability.label}</h4>
											<p className="mt-1 text-[10px] leading-relaxed text-[var(--ret-text-dim)]">{capability.description}</p>
											<p className={`mt-2 font-mono text-[8px] uppercase tracking-[0.16em] ${waiting ? "text-[var(--ret-amber)]" : "text-[var(--ret-green)]"}`}>
												{waiting ? "launch a machine first" : capability.proof}
											</p>
										</Link>
									);
								})}
							</div>
						</ReticleFrame>
					);
				})}
			</div>
		</section>
	);
}
