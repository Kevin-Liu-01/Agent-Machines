"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useOptionalMachineContext } from "@/components/dashboard/MachineProvider";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleHatch } from "@/components/reticle/ReticleHatch";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { DashboardLoadingState } from "@/components/dashboard/DashboardLoadingState";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { artifactContentType, artifactUrl } from "@/lib/storage/artifact-links";

type ArtifactRef = {
	id: string;
	name: string;
	mime: string;
	bytes: number;
	chatId: string | null;
	createdAt: string;
	sourcePath?: string;
};

type ListResponse =
	| { ok: true; artifacts: ArtifactRef[]; machineId: string; warnings?: string[] }
	| {
			ok: false;
			reason:
				| "machine_starting"
				| "machine_asleep"
				| "machine_error"
				| "machine_missing"
				| "no_active_machine"
				| "missing_credentials"
				| "exec_failed";
			message: string;
			machineId?: string;
			artifacts: [];
	  };

const POLL_TRANSIENT_MS = 3000;
const POLL_OK_MS = 30_000;

const TRANSIENT_REASONS: ReadonlySet<string> = new Set([
	"machine_starting",
]);

function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
	return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

function isImage(mime: string): boolean {
	return artifactContentType(mime).startsWith("image/");
}

function isText(mime: string): boolean {
	return (
		mime.startsWith("text/") ||
		mime === "application/json" ||
		mime === "application/xml"
	);
}

export function ArtifactsPanel() {
	const machineCtx = useOptionalMachineContext();
	const machineId = machineCtx?.machineId;
	return <MachineArtifacts key={machineId ?? "active"} machineId={machineId} />;
}

function MachineArtifacts({ machineId }: { machineId?: string }) {
	const [resolvedMachineId, setResolvedMachineId] = useState(machineId);
	const targetMachineId = machineId ?? resolvedMachineId;
	const [artifacts, setArtifacts] = useState<ArtifactRef[]>([]);
	const [machineState, setMachineState] = useState<{
		ok: boolean;
		reason: string | null;
		message: string | null;
	}>({ ok: false, reason: null, message: "loading" });
	const [error, setError] = useState<string | null>(null);
	const [warnings, setWarnings] = useState<string[]>([]);
	const [uploading, setUploading] = useState(false);
	const [waking, setWaking] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const pendingRefresh = useRef<AbortController | null>(null);

	const refresh = useCallback(async (force = false) => {
		// A provider read can take longer than the transient polling cadence.
		// Only explicit mutations supersede it; interval ticks must not starve it.
		if (pendingRefresh.current && !force) return;
		pendingRefresh.current?.abort();
		const controller = new AbortController();
		pendingRefresh.current = controller;
		setError(null);
		try {
			const params = machineId ? `?machineId=${encodeURIComponent(machineId)}` : "";
			const response = await fetch(`/api/dashboard/artifacts${params}`, {
				cache: "no-store",
				signal: controller.signal,
			});
			const body = (await response.json()) as ListResponse;
			if (controller.signal.aborted) return;
			if (!body || typeof body.ok !== "boolean" || (body.ok && (!response.ok || !Array.isArray(body.artifacts) || !body.machineId))) throw new Error("Could not load files. Please try again.");
			if (body.ok) {
				setResolvedMachineId(body.machineId);
				setArtifacts(body.artifacts);
				setWarnings(body.warnings ?? []);
				setMachineState({ ok: true, reason: null, message: null });
				setError(null);
			} else {
				if (body.machineId) setResolvedMachineId(body.machineId);
				setArtifacts([]);
				setMachineState({
					ok: false,
					reason: body.reason,
					message: body.message,
				});
			}
		} catch (err) {
			if (controller.signal.aborted) return;
			setError(err instanceof Error ? err.message : "fetch failed");
		} finally {
			if (pendingRefresh.current === controller) pendingRefresh.current = null;
		}
	}, [machineId]);

	const wake = useCallback(async () => {
		if (!targetMachineId) return;
		setWaking(true);
		setError(null);
		try {
			const response = await fetch(`/api/dashboard/machines/${encodeURIComponent(targetMachineId)}/wake`, { method: "POST", cache: "no-store" });
			if (!response.ok) {
				const body = await response.json().catch(() => ({}));
				throw new Error(body.message ?? body.error ?? `HTTP ${response.status}`);
			}
			await refresh(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Wake failed.");
		} finally { setWaking(false); }
	}, [refresh, targetMachineId]);

	useEffect(() => {
		void refresh();
		return () => pendingRefresh.current?.abort();
	}, [refresh]);

	useEffect(() => {
		const interval = window.setInterval(
			() => {
				if (document.visibilityState !== "visible") return;
				void refresh();
			},
			machineState.reason && TRANSIENT_REASONS.has(machineState.reason)
				? POLL_TRANSIENT_MS
				: POLL_OK_MS,
		);
		return () => window.clearInterval(interval);
	}, [refresh, machineState]);

	const upload = useCallback(
		async (file: File) => {
			if (!targetMachineId) return;
			setUploading(true);
			setError(null);
			try {
				const form = new FormData();
				form.append("file", file);
				form.append("machineId", targetMachineId);
				const response = await fetch("/api/dashboard/artifacts", {
					method: "POST",
					body: form,
				});
				if (!response.ok) {
					const body = (await response.json().catch(() => ({}))) as {
						message?: string;
					};
					throw new Error(body.message ?? `HTTP ${response.status}`);
				}
				await refresh(true);
			} catch (err) {
				setError(err instanceof Error ? err.message : "upload failed");
			} finally {
				setUploading(false);
			}
		},
		[refresh, targetMachineId],
	);

	const remove = useCallback(
		async (id: string) => {
			if (!targetMachineId) return;
			if (!window.confirm("Delete this artifact?")) return;
			try {
				const response = await fetch(artifactUrl(targetMachineId, id), {
					method: "DELETE",
				});
				if (!response.ok) {
					const body = (await response.json().catch(() => ({}))) as {
						message?: string;
					};
					setError(body.message ?? `HTTP ${response.status}`);
					return;
				}
				await refresh(true);
			} catch (err) {
				setError(err instanceof Error ? err.message : "delete failed");
			}
		},
		[refresh, targetMachineId],
	);

	const onDrop = useCallback(
		async (event: React.DragEvent<HTMLDivElement>) => {
			event.preventDefault();
			const file = event.dataTransfer.files[0];
			if (file) await upload(file);
		},
		[upload],
	);

	const isTransient =
		machineState.reason !== null && TRANSIENT_REASONS.has(machineState.reason);
	const dropDisabled = uploading || !machineState.ok || !targetMachineId;

	return (
		<div className="space-y-6 px-[var(--dashboard-gutter,20px)] py-8">
			{error ? (
			<ReticleFrame className="border-[var(--ret-red)]/40 bg-[var(--ret-red)]/5 p-3">
				<p role="alert" className="text-sm text-[var(--ret-red)]">
					{error}
				</p>
				<ReticleButton variant="secondary" className="mt-3" onClick={() => void refresh()}>Retry files</ReticleButton>
			</ReticleFrame>
			) : null}

			<MachineStateBanner state={machineState} machineId={targetMachineId} onWake={targetMachineId ? wake : undefined} waking={waking} />
			{warnings.map((warning) => <p key={warning} role="status" className="text-sm text-[var(--ret-amber)]">{warning}</p>)}

			<UploadZone
				disabled={dropDisabled}
				uploading={uploading}
				onPickFile={() => inputRef.current?.click()}
				onDrop={onDrop}
			/>
			<input
				ref={inputRef}
				type="file"
				className="hidden"
				onChange={(event) => {
					const file = event.target.files?.[0];
					if (file) void upload(file);
					event.target.value = "";
				}}
			/>

			{!machineState.ok && machineState.reason === null && !error ? (
				<DashboardLoadingState label="Loading workspace files…" />
			) : null}

			{artifacts.length === 0 && machineState.ok ? (
				<ReticleFrame>
					<ReticleHatch
						className="h-1.5 border-b border-[var(--ret-border)]"
						pitch={6}
					/>
					<div className="space-y-3 p-6 text-center">
						<h3 className="ret-display text-base">No artifacts yet</h3>
						<p className="mx-auto max-w-[60ch] text-sm text-[var(--ret-text-dim)]">
							Upload a file or save an output to{" "}
							<code className="font-mono">~/.agent-machines/artifacts/</code>{" "}
							. Files stay on this Worker's disk.
						</p>
						{targetMachineId ? <ReticleButton as="a" href={`/dashboard/machines/${encodeURIComponent(targetMachineId)}/console`} variant="secondary">Open agent console</ReticleButton> : null}
					</div>
				</ReticleFrame>
			) : null}

			{artifacts.length > 0 && targetMachineId ? (
				<section className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
					{artifacts.map((artifact) => (
						<ArtifactCard
							key={artifact.id}
							artifact={artifact}
							machineId={targetMachineId}
							onDelete={() => remove(artifact.id)}
							waking={isTransient}
						/>
					))}
				</section>
			) : null}
		</div>
	);
}

function MachineStateBanner({
	state,
	machineId,
	onWake,
	waking,
}: {
	state: { ok: boolean; reason: string | null; message: string | null };
	machineId?: string;
	onWake?: () => Promise<void>;
	waking: boolean;
}) {
	if (state.ok || state.reason === null) return null;
	if (state.reason === "machine_asleep") {
		return (
			<ReticleFrame className="border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/5 p-3">
				<p className="text-[13px] text-[var(--ret-amber)]">Machine paused.</p>
				<p className="mt-1 text-xs text-[var(--ret-text-muted)]">{state.message ?? "Artifacts remain on its disk. Wake the machine when you want to access them."}</p>
				{onWake ? <ReticleButton className="mt-3" disabled={waking} onClick={() => void onWake()}>{waking ? "Waking…" : "Wake machine"}</ReticleButton> : null}
			</ReticleFrame>
		);
	}
	if (state.reason === "machine_starting") {
		return (
		<ReticleFrame className="border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/5 p-3">
			<p className="text-[13px] text-[var(--ret-amber)]">
				Machine starting… artifacts will be available when it is ready.
			</p>
			<p className="mt-1 text-xs text-[var(--ret-text-muted)]">
				{state.message ?? "Waiting for the provider to finish starting."}
			</p>
		</ReticleFrame>
		);
	}
	if (state.reason === "no_active_machine") {
		return (
		<ReticleFrame className="border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/5 p-4">
			<p className="text-[13px] text-[var(--ret-amber)]">
				No active machine.
			</p>
			<a
				href="/dashboard/setup"
				className="mt-1 inline-block text-xs text-[var(--ret-purple)] underline"
			>
				Provision one →
			</a>
		</ReticleFrame>
		);
	}
	return (
	<ReticleFrame className="border-[var(--ret-red)]/40 bg-[var(--ret-red)]/5 p-3">
		<p role="alert" className="text-sm text-[var(--ret-red)]">
			{state.message ?? "Storage unavailable."}
		</p>
		<ReticleButton as="a" href={state.reason === "missing_credentials" ? "/dashboard/settings" : machineId ? `/dashboard/machines/${encodeURIComponent(machineId)}` : "/dashboard/machines"} variant="secondary" className="mt-3">{state.reason === "missing_credentials" ? "Open Settings" : "Manage machines"}</ReticleButton>
	</ReticleFrame>
	);
}

function UploadZone({
	disabled,
	uploading,
	onPickFile,
	onDrop,
}: {
	disabled: boolean;
	uploading: boolean;
	onPickFile: () => void;
	onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
}) {
	const [over, setOver] = useState(false);
	return (
		<div
			onDragOver={(event) => {
				event.preventDefault();
				setOver(true);
			}}
			onDragLeave={() => setOver(false)}
			onDrop={(event) => {
				setOver(false);
				if (!disabled) onDrop(event);
			}}
			className={cn(
				"flex flex-col items-center justify-center gap-2 border border-dashed py-8",
				disabled
					? "border-[var(--ret-border)] bg-[var(--ret-bg-soft)] opacity-50"
					: over
						? "border-[var(--ret-purple)] bg-[var(--ret-purple-glow)]"
						: "border-[var(--ret-border)] bg-[var(--ret-bg)] hover:bg-[var(--ret-surface)]",
			)}
		>
		<p className="text-sm text-[var(--ret-text)]">
			{uploading ? (
				<BrailleSpinner name="cascade" label="uploading" className="text-sm" />
			) : (
				"drop a file here"
			)}
		</p>
			<p className="text-xs font-medium text-[var(--ret-text-muted)]">
				or
			</p>
			<ReticleButton
				variant="secondary"
				size="sm"
				onClick={onPickFile}
				disabled={disabled}
			>
				Pick a file
			</ReticleButton>
		<p className="text-xs text-[var(--ret-text-muted)]">
			Max 8 MiB. Stored on your active machine's disk under
			~/.agent-machines/artifacts/
		</p>
		</div>
	);
}

function ArtifactCard({
	artifact,
	machineId,
	onDelete,
	waking,
}: {
	artifact: ArtifactRef;
	machineId: string;
	onDelete: () => void;
	waking: boolean;
}) {
	const url = artifactUrl(machineId, artifact.id, true);
	return (
		<ReticleFrame>
			<div className="flex items-center justify-between gap-2 border-b border-[var(--ret-border)] px-3 py-2">
				<span className="truncate font-mono text-[13px] text-[var(--ret-text)]">
					{artifact.name}
				</span>
				<span className="text-xs font-medium text-[var(--ret-text-muted)]">
					{formatBytes(artifact.bytes)}
				</span>
			</div>
			<div className="flex items-center justify-center bg-[var(--ret-bg-soft)] p-3">
				{waking ? (
					<span className="text-xs font-medium text-[var(--ret-amber)]">
						machine waking...
					</span>
				) : isImage(artifact.mime) ? (
					/* eslint-disable-next-line @next/next/no-img-element */
					<img
						src={url}
						alt={artifact.name}
						className="max-h-40 max-w-full object-contain"
					/>
				) : isText(artifact.mime) ? (
					<TextPreview url={url} />
				) : (
					<span className="text-xs font-medium text-[var(--ret-text-muted)]">
						{artifact.mime || "binary"}
					</span>
				)}
			</div>
			{artifact.sourcePath ? <p title={artifact.sourcePath} className="truncate px-3 pb-2 text-xs text-[var(--ret-text-muted)]">{artifact.sourcePath}</p> : null}
			<div className="flex items-center justify-between gap-2 border-t border-[var(--ret-border)] px-3 py-2">
				<span className="font-mono text-xs text-[var(--ret-text-muted)]">
					{new Date(artifact.createdAt).toLocaleString()}
				</span>
				<div className="flex items-center gap-2">
					<a
						href={url}
						download={artifact.name}
						className="text-xs font-medium text-[var(--ret-purple)] hover:underline"
					>
						download
					</a>
					<button
						type="button"
						onClick={onDelete}
						className="text-xs font-medium text-[var(--ret-text-muted)] hover:text-[var(--ret-red)]"
					>
						delete
					</button>
				</div>
			</div>
		</ReticleFrame>
	);
}

function TextPreview({ url }: { url: string }) {
	const [text, setText] = useState<string | null>(null);
	useEffect(() => {
		const controller = new AbortController();
		setText(null);
		fetch(url, { signal: controller.signal })
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.text();
			})
			.then((body) => setText(body.slice(0, 320)))
			.catch(() => { if (!controller.signal.aborted) setText("(failed to load preview)"); });
		return () => controller.abort();
	}, [url]);
	if (text === null) {
		return (
			<div className="flex h-40 w-full flex-col items-center justify-center gap-2">
				<BrailleSpinner
					name="orbit"
					className="text-xs text-[var(--ret-text-muted)]"
				/>
				<Skeleton className="h-2 w-3/4" />
				<Skeleton className="h-2 w-1/2" />
			</div>
		);
	}
	return (
		<pre className="max-h-40 w-full overflow-hidden font-mono text-xs text-[var(--ret-text-dim)]">
			{text}
		</pre>
	);
}
