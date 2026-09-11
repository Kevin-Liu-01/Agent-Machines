"use client";

import { useCallback, useState } from "react";

import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";
import { waitForControlPlaneOperation } from "@/lib/control-plane/client";
import type { ProviderCapabilities } from "@/lib/providers";
import { deletionConfirmation, deletionStorageWarning, VERCEL_SNAPSHOT_CLEANUP_URL } from "@/lib/dashboard/deletion-warning";

/**
 * Per-machine action bar.
 *
 * Single source of truth for the four transitions a user can drive
 * on a machine they own: wake, sleep, set active, archive / destroy.
 * Used by every surface that lists machines (FleetMonitor cards,
 * MachineSwitcher dropdown rows, MachinesPanel cards, ChatShell
 * asleep banner) so the buttons always read the same and always hit
 * the right route.
 *
 * Routing:
 *   wake     -> POST /api/dashboard/machines/<id>/wake
 *   sleep    -> POST /api/dashboard/machines/<id>/sleep
 *   active   -> PATCH /api/dashboard/machines/<id>  { active: true }
 *   archive  -> DELETE /api/dashboard/machines/<id>
 *   destroy  -> DELETE /api/dashboard/machines/<id>?destroy=1
 *
 * Visibility rules (driven by the live `state` so the bar never
 * offers an impossible transition):
 *   - wake:    visible when state === "sleeping"
 *   - sleep:   visible when ready AND manual pause is explicitly supported
 *   - active:  visible when !active && !archived
 *   - archive: visible when !archived (soft delete, recoverable)
 *   - destroy: visible when archived OR when `allowDestroy` is true
 *              (the /dashboard/machines page exposes destroy on
 *              non-archived machines too, behind a confirm prompt)
 *
 * Errors surface inline; the caller's polling loop picks the
 * post-action state on the next tick so we don't need optimistic
 * state machines here.
 */

export type MachineState =
	| "ready"
	| "starting"
	| "sleeping"
	| "destroying"
	| "destroyed"
	| "error"
	| "unknown";

type Action = "wake" | "sleep" | "active" | "archive" | "unarchive" | "destroy" | "forceRemove";

type Props = {
	machineId: string;
	providerKind?: string;
	state: MachineState;
	capabilities?: ProviderCapabilities | null;
	active: boolean;
	archived?: boolean;
	/**
	 * Show the hard-destroy button even when the machine isn't
	 * archived yet. Default false -- safer surfaces (the dropdown,
	 * the overview card) keep destroy hidden behind an archive
	 * first.
	 */
	allowDestroy?: boolean;
	/**
	 * Compact layout -- single icon buttons instead of labeled
	 * pills. Used in the MachineSwitcher popover where vertical
	 * space is tight.
	 */
	compact?: boolean;
	/** Called after any successful action so the caller can re-fetch. */
	onChange?: () => void | Promise<unknown>;
};

export function MachineActions({
	machineId,
	providerKind,
	state,
	capabilities,
	active,
	archived = false,
	allowDestroy = false,
	compact = false,
	onChange,
}: Props) {
	const [pending, setPending] = useState<Action | null>(null);
	const [error, setError] = useState<string | null>(null);

	const run = useCallback(
		async (action: Action): Promise<void> => {
			setPending(action);
			setError(null);
			try {
				const response = await call(action, machineId);
				if (!response.ok) {
					const body = (await response.json().catch(() => ({}))) as {
						message?: string;
						error?: string;
					};
					throw new Error(
						body.message ?? body.error ?? `HTTP ${response.status}`,
					);
				}
				if (action === "wake" || action === "sleep" || action === "destroy") {
					const body = (await response.json().catch(() => ({}))) as {
						operation?: { id?: string };
					};
					if (body.operation?.id) {
						await waitForControlPlaneOperation(body.operation.id);
					}
				}
				await onChange?.();
			} catch (err) {
				setError(err instanceof Error ? err.message : `${action} failed`);
			} finally {
				setPending(null);
			}
		},
		[machineId, onChange],
	);

	const onDestroy = useCallback((): void => {
		if (!window.confirm(deletionConfirmation("Hard-destroy this machine on the provider? This cannot be undone.", providerKind))) return;
		void run("destroy");
	}, [run, providerKind]);

	const onForceRemove = useCallback((): void => {
		if (!window.confirm("Remove this machine from the dashboard without calling the provider? Use this when the provider machine is already gone.")) return;
		void run("forceRemove");
	}, [run]);

	const canWake = state === "sleeping" && (capabilities?.canWake ?? true);
	const canSleep = state === "ready" && capabilities?.canSleep === true;
	const canSetActive = !active && !archived;
	const canArchive = !archived;
	const canUnarchive = archived;
	const canDestroy = (archived || allowDestroy) && (capabilities?.canDestroy ?? true);
	const canForceRemove = archived;

	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-1",
				compact ? "justify-end" : "justify-end",
			)}
		>
			{canWake ? (
				<ActionButton
					label="wake"
					tone="ok"
					pending={pending === "wake"}
					disabled={pending !== null}
					compact={compact}
					onClick={() => void run("wake")}
				/>
			) : null}
			{canSleep ? (
				<ActionButton
					label="sleep"
					tone="muted"
					pending={pending === "sleep"}
					disabled={pending !== null}
					compact={compact}
					onClick={() => void run("sleep")}
				/>
			) : null}
			{canSetActive ? (
				<ActionButton
					label="set active"
					tone="purple"
					pending={pending === "active"}
					disabled={pending !== null}
					compact={compact}
					onClick={() => void run("active")}
				/>
			) : null}
			{canArchive ? (
				<ActionButton
					label="archive"
					tone="muted"
					pending={pending === "archive"}
					disabled={pending !== null}
					compact={compact}
					onClick={() => void run("archive")}
				/>
			) : null}
			{canUnarchive ? (
				<ActionButton
					label="restore"
					tone="ok"
					pending={pending === "unarchive"}
					disabled={pending !== null}
					compact={compact}
					onClick={() => void run("unarchive")}
				/>
			) : null}
			{canDestroy ? (
				<ActionButton
					label="destroy"
					tone="warn"
					pending={pending === "destroy"}
					disabled={pending !== null}
					compact={compact}
					onClick={onDestroy}
				/>
			) : null}
			{canForceRemove ? (
				<ActionButton
					label="remove"
					tone="warn"
					pending={pending === "forceRemove"}
					disabled={pending !== null}
					compact={compact}
					onClick={onForceRemove}
				/>
			) : null}
			{error ? (
				<p
					role="alert"
					className="basis-full text-right text-sm leading-6 text-[var(--ret-red)]"
					title={error}
				>
					{error}
				</p>
			) : null}
			{state === "ready" && capabilities?.canSleep === false ? (
				<p className="basis-full text-right text-sm leading-6 text-[var(--ret-text-muted)]">
					{providerKind === "sprites"
						? "Sprites manages automatic idle suspension; active work or traffic can keep it running. Manual pause is unavailable."
						: "Manual pause is unavailable on this provider. This page does not stop compute."}
				</p>
			) : null}
			{canDestroy && deletionStorageWarning(providerKind) ? (
				<p className="basis-full text-right text-sm leading-6 text-[var(--ret-text-muted)]">
					{deletionStorageWarning(providerKind)}{" "}
					<a href={VERCEL_SNAPSHOT_CLEANUP_URL} target="_blank" rel="noreferrer" className="underline">Snapshot cleanup</a>
				</p>
			) : null}
		</div>
	);
}

function call(action: Action, machineId: string): Promise<Response> {
	const base = `/api/dashboard/machines/${encodeURIComponent(machineId)}`;
	switch (action) {
		case "wake":
			return fetch(`${base}/wake`, { method: "POST" });
		case "sleep":
			return fetch(`${base}/sleep`, { method: "POST" });
		case "active":
			return fetch(base, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ active: true }),
			});
		case "archive":
			return fetch(base, { method: "DELETE" });
		case "unarchive":
			return fetch(`${base}?unarchive=1`, { method: "DELETE" });
		case "destroy":
			return fetch(`${base}?destroy=1`, { method: "DELETE" });
		case "forceRemove":
			return fetch(`${base}?remove=1`, { method: "DELETE" });
	}
}

function ActionButton({
	label,
	tone,
	pending,
	disabled,
	compact,
	onClick,
}: {
	label: string;
	tone: "ok" | "warn" | "muted" | "purple";
	pending: boolean;
	disabled: boolean;
	compact: boolean;
	onClick: () => void;
}) {
	const toneClass =
		tone === "ok"
			? "text-[var(--ret-green)] hover:bg-[var(--ret-green)]/10"
			: tone === "warn"
				? "text-[var(--ret-red)] hover:bg-[var(--ret-red)]/10"
				: tone === "purple"
					? "text-[var(--ret-purple)] hover:bg-[var(--ret-purple)]/10"
					: "text-[var(--ret-text-muted)] hover:bg-[var(--ret-surface)]";
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"inline-flex items-center gap-1 rounded-md border border-transparent capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)] disabled:cursor-not-allowed",
				compact ? "min-h-9 px-2 py-1 text-sm" : "min-h-10 px-3 py-2 text-sm",
				toneClass,
				disabled && "opacity-50",
				pending && "border-current/30",
			)}
			aria-label={label}
		>
			{pending ? (
				<BrailleSpinner name="braille" className="text-sm" />
			) : null}
			<span>{label}</span>
		</button>
	);
}
