"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleHatch } from "@/components/reticle/ReticleHatch";
import { cn } from "@/lib/cn";

type ArtifactRef = {
	id: string;
	name: string;
	mime: string;
	bytes: number;
	chatId: string | null;
	createdAt: string;
};

type ListResponse =
	| { ok: true; artifacts: ArtifactRef[]; machineId: string }
	| {
			ok: false;
			reason:
				| "machine_starting"
				| "machine_asleep"
				| "machine_error"
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
	"machine_asleep",
]);

function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
	return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

function isImage(mime: string): boolean {
	return mime.startsWith("image/");
}

function isText(mime: string): boolean {
	return (
		mime.startsWith("text/") ||
		mime === "application/json" ||
		mime === "application/xml"
	);
}

function downloadUrl(id: string): string {
	return `/api/dashboard/artifacts/${id}/download`;
}

export function ArtifactsPanel() {
	const [artifacts, setArtifacts] = useState<ArtifactRef[]>([]);
	const [machineState, setMachineState] = useState<{
		ok: boolean;
		reason: string | null;
		message: string | null;
	}>({ ok: false, reason: null, message: "loading..." });
	const [error, setError] = useState<string | null>(null);
	const [uploading, setUploading] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const refresh = useCallback(async () => {
		try {
			const response = await fetch("/api/dashboard/artifacts", {
				cache: "no-store",
			});
			const body = (await response.json()) as ListResponse;
			if (body.ok) {
				setArtifacts(body.artifacts);
				setMachineState({ ok: true, reason: null, message: null });
				setError(null);
			} else {
				setArtifacts([]);
				setMachineState({
					ok: false,
					reason: body.reason,
					message: body.message,
				});
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "fetch failed");
		}
	}, []);

	useEffect(() => {
		void refresh();
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
			setUploading(true);
			setError(null);
			try {
				const form = new FormData();
				form.append("file", file);
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
				await refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : "upload failed");
			} finally {
				setUploading(false);
			}
		},
		[refresh],
	);

	const remove = useCallback(
		async (id: string) => {
			if (!window.confirm("Delete this artifact?")) return;
			try {
				const response = await fetch(`/api/dashboard/artifacts/${id}`, {
					method: "DELETE",
				});
				if (!response.ok) {
					const body = (await response.json().catch(() => ({}))) as {
						message?: string;
					};
					setError(body.message ?? `HTTP ${response.status}`);
					return;
				}
				await refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : "delete failed");
			}
		},
		[refresh],
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
	const dropDisabled = uploading || !machineState.ok;

	return (
		<div className="space-y-6 px-5 py-5">
			{error ? (
				<ReticleFrame className="border-[var(--ret-red)]/40 bg-[var(--ret-red)]/5 p-3">
					<p className="font-mono text-[11px] text-[var(--ret-red)]">
						{error}
					</p>
				</ReticleFrame>
			) : null}

			<MachineStateBanner state={machineState} />

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

			{artifacts.length === 0 && machineState.ok ? (
				<ReticleFrame>
					<ReticleHatch
						className="h-1.5 border-b border-[var(--ret-border)]"
						pitch={6}
					/>
					<div className="space-y-3 p-6 text-center">
						<h3 className="ret-display text-base">No artifacts yet</h3>
						<p className="mx-auto max-w-[60ch] text-[12px] text-[var(--ret-text-dim)]">
							Drop a file above or pick one with the picker. Artifacts persist
							on your machine's disk under{" "}
							<code className="font-mono">~/.agent-machines/artifacts/</code>{" "}
							-- the agent on the same VM can read them as context.
						</p>
					</div>
				</ReticleFrame>
			) : null}

			{artifacts.length > 0 ? (
				<section className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
					{artifacts.map((artifact) => (
						<ArtifactCard
							key={artifact.id}
							artifact={artifact}
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
}: {
	state: { ok: boolean; reason: string | null; message: string | null };
}) {
	if (state.ok) return null;
	if (state.reason === "machine_starting" || state.reason === "machine_asleep") {
		return (
			<ReticleFrame className="border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/5 p-3">
				<p className="font-mono text-[11px] text-[var(--ret-amber)]">
					Waking your machine... artifacts live on its disk.
				</p>
				<p className="mt-1 font-mono text-[10px] text-[var(--ret-text-muted)]">
					{state.message ?? "First open after sleep takes ~30 seconds."}
				</p>
			</ReticleFrame>
		);
	}
	if (state.reason === "no_active_machine") {
		return (
			<ReticleFrame className="border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/5 p-4">
				<p className="font-mono text-[11px] text-[var(--ret-amber)]">
					No active machine.
				</p>
				<a
					href="/dashboard/setup"
					className="mt-1 inline-block font-mono text-[10px] text-[var(--ret-purple)] underline"
				>
					{"Provision one ->"}
				</a>
			</ReticleFrame>
		);
	}
	return (
		<ReticleFrame className="border-[var(--ret-red)]/40 bg-[var(--ret-red)]/5 p-3">
			<p className="font-mono text-[11px] text-[var(--ret-red)]">
				{state.message ?? "Storage unavailable."}
			</p>
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
			<p className="font-mono text-[12px] text-[var(--ret-text)]">
				{uploading ? "uploading..." : "drop a file here"}
			</p>
			<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
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
			<p className="font-mono text-[10px] text-[var(--ret-text-muted)]">
				Max 8 MiB. Stored on your active machine's disk under
				~/.agent-machines/artifacts/
			</p>
		</div>
	);
}

function ArtifactCard({
	artifact,
	onDelete,
	waking,
}: {
	artifact: ArtifactRef;
	onDelete: () => void;
	waking: boolean;
}) {
	const url = downloadUrl(artifact.id);
	return (
		<ReticleFrame>
			<div className="flex items-center justify-between gap-2 border-b border-[var(--ret-border)] px-3 py-2">
				<span className="truncate font-mono text-[11px] text-[var(--ret-text)]">
					{artifact.name}
				</span>
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{formatBytes(artifact.bytes)}
				</span>
			</div>
			<div className="flex items-center justify-center bg-[var(--ret-bg-soft)] p-3">
				{waking ? (
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-amber)]">
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
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						{artifact.mime || "binary"}
					</span>
				)}
			</div>
			<div className="flex items-center justify-between gap-2 border-t border-[var(--ret-border)] px-3 py-2">
				<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
					{new Date(artifact.createdAt).toLocaleString()}
				</span>
				<div className="flex items-center gap-2">
					<a
						href={url}
						download={artifact.name}
						className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-purple)] hover:underline"
					>
						download
					</a>
					<button
						type="button"
						onClick={onDelete}
						className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)] hover:text-[var(--ret-red)]"
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
		fetch(url)
			.then((r) => r.text())
			.then((body) => setText(body.slice(0, 320)))
			.catch(() => setText("(failed to load preview)"));
	}, [url]);
	return (
		<pre className="max-h-40 w-full overflow-hidden font-mono text-[10px] text-[var(--ret-text-dim)]">
			{text ?? "loading..."}
		</pre>
	);
}
