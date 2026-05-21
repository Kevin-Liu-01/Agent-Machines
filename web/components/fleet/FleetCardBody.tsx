"use client";

import { Logo } from "@/components/Logo";
import { TerminalStream } from "@/components/fleet/TerminalStream";
import { ServiceIcon, type ServiceSlug } from "@/components/ServiceIcon";
import { ToolIcon } from "@/components/ToolIcon";
import { cn } from "@/lib/cn";
import type { FleetToolBadge } from "@/lib/fleet/agent-styling";
import type { FleetStreamCardModel } from "@/lib/fleet/view-model";

function ToolRail({ tools, color }: { tools: FleetToolBadge[]; color: string }) {
	return (
		<div className="flex flex-col items-center gap-2 py-2">
			{tools.map((t, i) => (
				<span
					key={i}
					className="flex h-5 w-5 items-center justify-center opacity-50 transition-opacity group-hover:opacity-100"
					style={{ color }}
				>
					{t.kind === "service" ? (
						<ServiceIcon slug={t.slug as ServiceSlug} size={13} tone="mono" />
					) : (
						<ToolIcon name={t.name} size={13} />
					)}
				</span>
			))}
		</div>
	);
}

const STATE_DOT: Record<string, string> = {
	ready: "animate-pulse",
	starting: "animate-pulse",
	sleeping: "opacity-40",
	error: "opacity-80",
};

export function FleetCardBody({
	card,
	delaySec = 0,
	live = true,
	stateLabel,
	extraBadges,
}: {
	card: FleetStreamCardModel;
	delaySec?: number;
	live?: boolean;
	stateLabel?: React.ReactNode;
	extraBadges?: React.ReactNode;
}) {
	const color = card.hue;

	return (
		<>
			<div className="flex items-center gap-1.5 px-3 py-2">
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="h-3 w-3 text-[var(--ret-text-muted)]"
					aria-hidden="true"
				>
					<rect x="2" y="2" width="20" height="8" rx="2" />
					<rect x="2" y="14" width="20" height="8" rx="2" />
					<line x1="6" y1="6" x2="6.01" y2="6" />
					<line x1="6" y1="18" x2="6.01" y2="18" />
				</svg>
				<span className="text-[9px] font-medium uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					machine
				</span>
				{card.active ? (
					<span className="rounded bg-[var(--ret-accent)]/15 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[var(--ret-accent)]">
						active
					</span>
				) : null}
				{extraBadges}
				{stateLabel ? <span className="ml-1">{stateLabel}</span> : null}
				<span className="ml-auto font-mono text-[9px]" style={{ color }}>
					{card.shortId}
				</span>
			</div>

			<div className="relative h-1 w-full overflow-hidden border-y border-[var(--ret-border)]">
				<div
					className="absolute inset-0 opacity-40"
					style={{
						backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 2px, transparent 2px 5px)`,
					}}
				/>
				<div
					className="fleet-pulse-sweep absolute inset-0"
					style={{
						backgroundImage: `linear-gradient(90deg, transparent 0%, ${color} 50%, transparent 100%)`,
						backgroundSize: "30% 100%",
						backgroundRepeat: "no-repeat",
					}}
				/>
			</div>

			<div className="grid grid-cols-[1fr_auto]">
				<div className="flex min-w-0 flex-col">
					<div className="flex items-center gap-2 border-b border-dashed border-[var(--ret-border)] px-3 py-2.5">
						<span
							className="flex h-7 w-7 shrink-0 items-center justify-center border"
							style={{ borderColor: `${color}44`, background: `${color}0a` }}
						>
							<Logo mark={card.logoMark as "nous"} size={15} />
						</span>
						<div className="min-w-0">
							<p className="truncate text-[11px] font-semibold text-[var(--ret-text)] group-hover:text-[var(--ret-purple)]">
								{card.agentName}
							</p>
							<p className="truncate text-[9px] text-[var(--ret-text-muted)]">
								{card.name} · {card.providerLabel}
							</p>
						</div>
						<span
							className={cn(
								"ml-auto h-1.5 w-1.5 shrink-0 rounded-full",
								STATE_DOT[card.state] ?? "opacity-60",
							)}
							style={{
								background: card.state === "error" ? "var(--ret-red)" : color,
								boxShadow: card.state === "sleeping" ? "none" : `0 0 6px ${color}`,
							}}
							title={card.state}
						/>
					</div>

					<div className="grid grid-cols-3 border-b border-dashed border-[var(--ret-border)] text-center">
						{[
							{ label: "CPU", value: card.cpu },
							{ label: "MEM", value: card.mem },
							{ label: "DISK", value: card.disk },
						].map((s) => (
							<div
								key={s.label}
								className="border-r border-dashed border-[var(--ret-border)] px-1 py-1.5 last:border-r-0"
							>
								<p className="text-[8px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
									{s.label}
								</p>
								<p className="text-[10px] tabular-nums text-[var(--ret-text-dim)]">{s.value}</p>
							</div>
						))}
					</div>

					<div className="flex-1 bg-[var(--ret-bg-soft)] px-3 py-2">
						<div className="mb-1 flex items-center gap-1.5">
							<span className="h-1 w-1 rounded-full" style={{ background: color }} />
							<span className="h-1 w-1 rounded-full opacity-40" style={{ background: color }} />
							<span className="h-1 w-1 rounded-full opacity-20" style={{ background: color }} />
							<span className="ml-auto text-[8px] tabular-nums text-[var(--ret-text-muted)]">
								{card.region}
							</span>
						</div>
						<TerminalStream lines={card.lines} color={color} delaySec={delaySec} live={live} />
					</div>
				</div>

				<div className="flex flex-col items-center border-l border-[var(--ret-border)] bg-[var(--ret-bg-soft)]">
					<span className="p-1.5 text-[7px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
						tools
					</span>
					<div className="h-px w-full bg-[var(--ret-border)]" />
					<ToolRail tools={card.tools} color={color} />
				</div>
			</div>

			<div className="flex items-center justify-between border-t border-[var(--ret-border)] px-3 py-1.5">
				<span className="text-[8px] tabular-nums text-[var(--ret-text-muted)]">↑ {card.uptime}</span>
				{card.lastActivityLabel ? (
					<span className="font-mono text-[8px] uppercase tracking-wider text-[var(--ret-text-dim)]">
						{card.lastActivityLabel}
					</span>
				) : null}
			</div>
		</>
	);
}
