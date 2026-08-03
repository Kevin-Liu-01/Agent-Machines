"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";
import {
	PROVIDER_LABEL,
	type MigrationState,
	type ProviderKind,
} from "@/lib/user-config/schema";

/**
 * "Move to <substrate>" control for the machine detail header -- the sandbox
 * router made clickable. Follows the MachineActions idiom exactly: per-action
 * fetch to the API, pending spinner, inline error, NO optimistic state (the
 * page's 5s polling loop picks up migrationState on the next tick).
 *
 * Fail closed, visibly: credentialed lanes are enabled; lanes resolveRoute
 * skipped render disabled with their missing keys named -- the same
 * explanation the mux prints. The confirm dialog quotes the STATIC state-move
 * contract (what moves / is re-derived / is lost) served by the migrate GET
 * endpoint, which sources it from "agent-machines/mux" -- one wording on
 * every surface.
 */

type Lane = { substrate: ProviderKind };
type SkippedLane = { substrate: ProviderKind; missing: string[] };

type MigrateInfo = {
	ok: boolean;
	current: ProviderKind;
	lanes: Lane[];
	skipped: SkippedLane[];
	canParkSource: boolean;
	migrationState: MigrationState | null;
	contract: {
		moves: string[];
		rederived: string[];
		lost: string[];
		notes: string[];
	};
};

type SourceOption = "destroy" | "park" | "keep";

export function SubstrateMoveMenu({
	machineId,
	migrationState,
	bootstrapRunning,
	onScheduled,
}: {
	machineId: string;
	migrationState?: MigrationState | null;
	/** Disables the control while a bootstrap is in flight (409 anyway). */
	bootstrapRunning?: boolean;
	onScheduled?: () => void;
}) {
	const [open, setOpen] = useState(false);
	const [info, setInfo] = useState<MigrateInfo | null>(null);
	const [target, setTarget] = useState<ProviderKind | null>(null);
	const [source, setSource] = useState<SourceOption>("destroy");
	const [moveState, setMoveState] = useState(true);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const ref = useRef<HTMLDivElement | null>(null);

	const migrating =
		migrationState?.phase === "running" || info?.migrationState?.phase === "running";

	useEffect(() => {
		if (!open) return;
		function handler(event: MouseEvent) {
			if (!ref.current) return;
			if (ref.current.contains(event.target as Node)) return;
			setOpen(false);
			setTarget(null);
		}
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	const load = useCallback(async () => {
		const response = await fetch(
			`/api/dashboard/machines/${encodeURIComponent(machineId)}/migrate`,
			{ cache: "no-store" },
		);
		if (!response.ok) return;
		const body = (await response.json().catch(() => null)) as MigrateInfo | null;
		if (body?.ok) setInfo(body);
	}, [machineId]);

	useEffect(() => {
		if (!open || info) return;
		void load().catch(() => undefined);
	}, [open, info, load]);

	async function confirm() {
		if (!target || pending) return;
		setPending(true);
		setError(null);
		try {
			const response = await fetch(
				`/api/dashboard/machines/${encodeURIComponent(machineId)}/migrate`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						to: target,
						moveState: target === "vercel" ? false : moveState,
						source,
					}),
				},
			);
			if (response.status !== 202) {
				const body = (await response.json().catch(() => ({}))) as {
					message?: string;
					error?: string;
				};
				throw new Error(body.message ?? body.error ?? `HTTP ${response.status}`);
			}
			setOpen(false);
			setTarget(null);
			onScheduled?.();
		} catch (err) {
			setError(err instanceof Error ? err.message : "migrate failed");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="relative" ref={ref}>
			<button
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				disabled={migrating || bootstrapRunning}
				className={cn(
					"inline-flex items-center gap-1 border border-transparent px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-purple)] transition-colors hover:bg-[var(--ret-purple)]/10",
					(migrating || bootstrapRunning) && "opacity-50",
				)}
				title={
					migrating
						? "a migration is already running"
						: "move this machine's load to another sandbox substrate"
				}
			>
				{migrating ? <BrailleSpinner name="braille" className="text-[10px]" /> : null}
				<span>{migrating ? "moving…" : "move"}</span>
			</button>
			{open ? (
				<div className="absolute right-0 z-30 mt-1 w-80 max-w-[calc(100vw-24px)] border border-[var(--ret-border)] bg-[var(--ret-bg)] shadow-lg">
					<p className="border-b border-[var(--ret-border)] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
						Move to substrate
					</p>
					{!info ? (
						<p className="px-3 py-3 font-mono text-[10px] text-[var(--ret-text-muted)]">
							loading lanes…
						</p>
					) : target === null ? (
						<ul>
							{info.lanes.map((lane) => (
								<li key={lane.substrate}>
									<button
										type="button"
										onClick={() => {
											setTarget(lane.substrate);
											if (lane.substrate === "vercel") setMoveState(false);
										}}
										className="flex w-full items-baseline justify-between gap-2 border-b border-[var(--ret-border)] px-3 py-2 text-left text-[12px] text-[var(--ret-text)] transition-colors hover:bg-[var(--ret-surface)]"
									>
										<span>{PROVIDER_LABEL[lane.substrate]}</span>
										<span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">
											credentialed
										</span>
									</button>
								</li>
							))}
							{info.skipped.map((lane) => (
								<li
									key={lane.substrate}
									className="flex items-baseline justify-between gap-2 border-b border-[var(--ret-border)] px-3 py-2 text-[12px] text-[var(--ret-text-dim)] opacity-70"
									title={`needs ${lane.missing.join(", ")}`}
								>
									<span>{PROVIDER_LABEL[lane.substrate]}</span>
									<span className="min-w-0 truncate font-mono text-[9px] text-[var(--ret-text-muted)]">
										needs {lane.missing.join(", ")}
									</span>
								</li>
							))}
							{info.lanes.length === 0 && info.skipped.length === 0 ? (
								<li className="px-3 py-2 font-mono text-[10px] text-[var(--ret-text-muted)]">
									no other lanes
								</li>
							) : null}
						</ul>
					) : (
						<div className="px-3 py-2">
							<p className="text-[12px] text-[var(--ret-text)]">
								Move to <strong>{PROVIDER_LABEL[target]}</strong>
							</p>
							<div className="mt-2 max-h-44 space-y-2 overflow-y-auto border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-2">
								<ContractList
									label="moves"
									items={
										target === "vercel" || !moveState
											? ["nothing -- moveState:false ships no files"]
											: info.contract.moves
									}
								/>
								<ContractList label="re-derived" items={info.contract.rederived} />
								<ContractList
									label="lost"
									items={
										!moveState || target === "vercel"
											? [
													...info.contract.lost,
													"everything file-shaped stays on the source (moveState:false)",
												]
											: info.contract.lost
									}
								/>
								{info.contract.notes.length > 0 ? (
									<ContractList label="notes" items={info.contract.notes} />
								) : null}
							</div>
							<div className="mt-2 space-y-1">
								<p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
									old sandbox
								</p>
								{(["destroy", "park", "keep"] as const).map((option) => {
									const parkUnsupported = option === "park" && !info.canParkSource;
									return (
										<label
											key={option}
											className={cn(
												"flex items-center gap-2 font-mono text-[10px] text-[var(--ret-text)]",
												parkUnsupported && "opacity-50",
											)}
											title={
												parkUnsupported
													? `park is not supported on ${PROVIDER_LABEL[info.current]}`
													: undefined
											}
										>
											<input
												type="radio"
												name="am-migrate-source"
												checked={source === option}
												disabled={parkUnsupported}
												onChange={() => setSource(option)}
											/>
											{option}
											{option === "destroy" ? " (default)" : ""}
										</label>
									);
								})}
							</div>
							{error ? (
								<p
									role="alert"
									className="mt-2 break-words font-mono text-[10px] text-[var(--ret-red)]"
								>
									{error}
								</p>
							) : null}
							<div className="mt-2 flex items-center justify-end gap-2">
								<button
									type="button"
									onClick={() => setTarget(null)}
									disabled={pending}
									className="px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)] hover:bg-[var(--ret-surface)]"
								>
									back
								</button>
								<button
									type="button"
									onClick={() => void confirm()}
									disabled={pending}
									className="inline-flex items-center gap-1 border border-[var(--ret-purple)]/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-purple)] hover:bg-[var(--ret-purple)]/10"
								>
									{pending ? <BrailleSpinner name="braille" className="text-[10px]" /> : null}
									move
								</button>
							</div>
						</div>
					)}
				</div>
			) : null}
		</div>
	);
}

function ContractList({ label, items }: { label: string; items: string[] }) {
	return (
		<div>
			<p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
				{label}
			</p>
			<ul className="mt-0.5 list-disc pl-4">
				{items.map((item) => (
					<li key={item} className="text-[10px] leading-snug text-[var(--ret-text-dim)]">
						{item}
					</li>
				))}
			</ul>
		</div>
	);
}
