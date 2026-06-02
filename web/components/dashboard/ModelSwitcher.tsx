"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Logo } from "@/components/Logo";
import {
	groupedModelCatalog,
	modelDisplayLabel,
	modelProviderMark,
} from "@/lib/dashboard/model-catalog";
import {
	headerControlKicker,
	headerControlTrigger,
	headerControlValue,
	headerPopover,
	headerPopoverTitle,
} from "@/lib/dashboard/header-chrome";
import { cn } from "@/lib/cn";

const POLL_MS = 8000;

type Payload = {
	ok: boolean;
	machines: Array<{ id: string; model: string; archived?: boolean }>;
	activeMachineId: string | null;
};

type Props = {
	activeMachineId?: string | null;
};

/**
 * Header control to change the inference model on the active machine
 * (and the draft for the next provision).
 */
export function ModelSwitcher({ activeMachineId }: Props) {
	const router = useRouter();
	const [data, setData] = useState<Payload | null>(null);
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);

	const refresh = useCallback(async () => {
		try {
			const response = await fetch("/api/dashboard/machines", {
				cache: "no-store",
			});
			if (!response.ok) return;
			setData((await response.json()) as Payload);
		} catch {
			// retry on next tick
		}
	}, []);

	useEffect(() => {
		void refresh();
		const id = window.setInterval(() => {
			if (document.visibilityState === "visible") void refresh();
		}, POLL_MS);
		return () => window.clearInterval(id);
	}, [refresh]);

	useEffect(() => {
		if (!open) return;
		function onClick(event: MouseEvent): void {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		}
		function onKey(event: KeyboardEvent): void {
			if (event.key === "Escape") setOpen(false);
		}
		document.addEventListener("mousedown", onClick);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onClick);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const machines = data?.machines.filter((m) => !m.archived) ?? [];
	const targetId = activeMachineId ?? data?.activeMachineId ?? null;
	const active = machines.find((m) => m.id === targetId) ?? null;
	const currentModel = active?.model ?? null;
	const mark = currentModel ? modelProviderMark(currentModel) : null;

	async function pick(modelId: string): Promise<void> {
		if (!modelId || modelId === currentModel || pending) {
			setOpen(false);
			return;
		}
		setPending(modelId);
		setError(null);
		try {
			await fetch("/api/dashboard/admin/setup", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ draftModel: modelId }),
			});
			if (targetId) {
				const response = await fetch(`/api/dashboard/machines/${targetId}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ model: modelId }),
				});
				if (!response.ok) {
					throw new Error(`machine HTTP ${response.status}`);
				}
			}
			await refresh();
			router.refresh();
			setOpen(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "model switch failed");
		} finally {
			setPending(null);
		}
	}

	const groups = groupedModelCatalog();

	return (
		<div className="relative" ref={rootRef}>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="listbox"
				aria-expanded={open}
				className={headerControlTrigger(open)}
				title={
					currentModel
						? `Model: ${currentModel}. Click to change.`
						: "Pick a model for the active machine"
				}
			>
				<span className={headerControlKicker}>Model</span>
				{mark ? <Logo mark={mark} size={13} /> : null}
				<span className={cn(headerControlValue, "max-w-[120px]")}>
					{currentModel ? modelDisplayLabel(currentModel) : "—"}
				</span>
				<Chevron open={open} />
			</button>

			{open ? (
				<div role="listbox" className={cn(headerPopover, "w-[280px]")}>
					<p className={headerPopoverTitle}>Inference model</p>
					<ul className="max-h-[min(420px,55dvh)] overflow-y-auto py-1">
						{groups.map(({ group, label, models }) => (
							<li key={group}>
								<p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--ret-text-muted)]">
									{label}
								</p>
								<ul>
									{models.map((option) => {
										const selected = option.id === currentModel;
										const inFlight = pending === option.id;
										return (
											<li key={option.id}>
												<button
													type="button"
													role="option"
													aria-selected={selected}
													disabled={Boolean(pending)}
													onClick={() => void pick(option.id)}
													className={cn(
														"flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
														selected
															? "bg-[var(--ret-purple-glow)]"
															: "hover:bg-[var(--ret-surface)]",
														inFlight && "opacity-60",
													)}
												>
													{option.mark ? (
														<Logo mark={option.mark} size={14} />
													) : (
														<span className="h-3.5 w-3.5 shrink-0 bg-[var(--ret-border)]" />
													)}
													<span className="min-w-0 flex-1">
														<span className="block text-[12px] text-[var(--ret-text)]">
															{option.label}
														</span>
														<span className="block truncate font-mono text-[10px] text-[var(--ret-text-muted)]">
															{option.id}
														</span>
														{option.hint ? (
															<span className="block text-[10px] text-[var(--ret-text-muted)]">
																{option.hint}
															</span>
														) : null}
													</span>
													{selected ? (
														<span className="text-[10px] font-medium text-[var(--ret-purple)]">
															active
														</span>
													) : null}
												</button>
											</li>
										);
									})}
								</ul>
							</li>
						))}
					</ul>
					{error ? (
						<p className="border-t border-[var(--ret-red)]/35 bg-[var(--ret-red)]/10 px-3 py-2 text-[11px] text-[var(--ret-red)]">
							{error}
						</p>
					) : null}
					<p className="border-t border-[var(--ret-border)] px-3 py-2 text-[11px] leading-relaxed text-[var(--ret-text-muted)]">
						{targetId
							? "Updates this machine and the draft for the next spin-up."
							: "Sets the model for your next provisioned machine."}
					</p>
				</div>
			) : null}
		</div>
	);
}

function Chevron({ open }: { open: boolean }) {
	return (
		<svg
			viewBox="0 0 12 12"
			className={cn(
				"h-2.5 w-2.5 shrink-0 text-[var(--ret-text-muted)] transition-transform",
				open && "rotate-180",
			)}
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden
		>
			<path d="M2.5 4.5 L6 8 L9.5 4.5" />
		</svg>
	);
}
