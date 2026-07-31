"use client";

import { Logo, type Mark } from "@/components/Logo";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import {
	HARNESS_CAPABILITIES,
	SUBSTRATE_CAPABILITIES,
	type HarnessKind,
	type SubstrateKind,
} from "@/lib/mux/capabilities";
import { cn } from "@/lib/cn";

const SUBSTRATE_MARK: Record<SubstrateKind, Mark> = {
	e2b: "e2b",
	sprites: "sprites",
	vercel: "vercel",
	dedalus: "dedalus",
};

const HARNESS_MARK: Record<HarnessKind, Mark> = {
	"claude-code": "claudecode",
	codex: "codex",
	openclaw: "openclaw",
	hermes: "nous",
};

type Props = {
	/** Ordered route, primary first. Uncredentialed lanes are excluded. */
	route: SubstrateKind[];
	/** Lanes the router skipped, with the credentials they still need. */
	skipped?: Array<{ substrate: SubstrateKind; missing: string[] }>;
	agent?: HarnessKind;
	className?: string;
};

/**
 * Reads the resolved route the way the router decides it: primary first,
 * backups in order, uncredentialed lanes shown as skipped rather than
 * hidden, so "why did this land on sprites?" is answerable at a glance.
 */
export function SandboxRouterPanel({ route, skipped = [], agent, className }: Props) {
	const primary = route[0];
	const backups = route.slice(1);
	const harness = agent
		? HARNESS_CAPABILITIES.find((item) => item.kind === agent)
		: undefined;

	return (
		<div className={cn("border border-[var(--ret-border)]", className)}>
			<div className="flex items-baseline justify-between border-b border-[var(--ret-border)] px-4 py-3">
				<ReticleLabel>Sandbox router</ReticleLabel>
				<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
					{route.length > 0 ? route.join(" -> ") : "no credentialed lane"}
				</span>
			</div>

			{harness ? (
				<div className="flex items-center gap-2 border-b border-[var(--ret-border)] px-4 py-3 text-[12px]">
					<Logo mark={HARNESS_MARK[harness.kind]} size={14} />
					<span className="font-medium text-[var(--ret-text)]">{harness.label}</span>
					<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
						{harness.wireFormat}
					</span>
					{harness.heavyInstall ? (
						<span className="ml-auto font-mono text-[10px] text-[var(--ret-text-muted)]">
							pre-bake recommended
						</span>
					) : null}
				</div>
			) : null}

			<div className="grid gap-px bg-[var(--ret-border)]">
				{route.map((kind) => {
					const cap = SUBSTRATE_CAPABILITIES.find((item) => item.kind === kind);
					if (!cap) return null;
					const isPrimary = kind === primary;
					return (
						<div
							key={kind}
							className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 bg-[var(--ret-bg)] px-4 py-3"
						>
							<Logo mark={SUBSTRATE_MARK[kind]} size={15} />
							<div className="min-w-0">
								<div className="flex items-center gap-2">
									<span className="text-[13px] font-semibold text-[var(--ret-text)]">
										{cap.label}
									</span>
									<span
										className={cn(
											"border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em]",
											isPrimary
												? "border-[var(--ret-text)] text-[var(--ret-text)]"
												: "border-[var(--ret-border)] text-[var(--ret-text-muted)]",
										)}
									>
										{isPrimary ? "primary" : "backup"}
									</span>
								</div>
								<div className="mt-1 font-mono text-[10px] text-[var(--ret-text-muted)]">
									pty {cap.pty} . {cap.persistence} .{" "}
									{cap.streamingExec ? "streaming" : "batch exec"}
								</div>
							</div>
							<span className="text-right font-mono text-[10px] text-[var(--ret-text-muted)]">
								{cap.measured.execMs === null
									? "not measured"
									: `exec ${cap.measured.execMs}ms`}
							</span>
						</div>
					);
				})}
			</div>

			{skipped.length > 0 ? (
				<div className="border-t border-[var(--ret-border)] px-4 py-3">
					<div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						skipped
					</div>
					<ul className="mt-2 grid gap-1.5">
						{skipped.map((entry) => (
							<li
								key={entry.substrate}
								className="flex flex-wrap items-baseline gap-2 text-[11px] text-[var(--ret-text-dim)]"
							>
								<span className="font-medium text-[var(--ret-text-secondary)]">
									{SUBSTRATE_CAPABILITIES.find(
										(item) => item.kind === entry.substrate,
									)?.label ?? entry.substrate}
								</span>
								<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
									needs {entry.missing.join(", ")}
								</span>
							</li>
						))}
					</ul>
				</div>
			) : null}

			{backups.length === 0 && route.length > 0 ? (
				<div className="border-t border-[var(--ret-border)] px-4 py-2.5 font-mono text-[10px] text-[var(--ret-text-muted)]">
					no backup lane -- a failed placement has nowhere to fail over
				</div>
			) : null}
		</div>
	);
}
