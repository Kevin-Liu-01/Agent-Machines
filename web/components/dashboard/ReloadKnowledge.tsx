"use client";

import { useCallback, useState } from "react";

import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";

type ReloadResponse = {
	ok?: boolean;
	head?: string | null;
	stdout?: string;
	stderr?: string;
	reloadedAt?: string;
	error?: string;
	message?: string;
};

type Props = {
	machinePhase: string | undefined;
};

/**
 * "Reload knowledge" card. Triggers POST /api/dashboard/admin/reload,
 * which runs the on-VM `reload-from-git.sh` script -- git fetch + reset
 * + rsync the latest knowledge/ from the agent-machines repo into
 * ~/.agent-machines/. This is the persistence story: edit a SKILL.md on GitHub
 * (or push from any machine) and the agent picks it up here, no CLI.
 *
 * The button disables when the machine isn't running (the route would
 * 503 anyway with `machine_offline`); the auto-wake on the dashboard
 * usually has the box up by the time this card is interactive.
 */
export function ReloadKnowledge({ machinePhase }: Props) {
	const [pending, setPending] = useState(false);
	const [result, setResult] = useState<ReloadResponse | null>(null);

	const trigger = useCallback(async () => {
		setPending(true);
		setResult(null);
		try {
			const response = await fetch("/api/dashboard/admin/reload", {
				method: "POST",
				cache: "no-store",
			});
			const body = (await response.json()) as ReloadResponse;
			setResult(body);
		} catch (err) {
			setResult({
				ok: false,
				error: "client_error",
				message: err instanceof Error ? err.message : "fetch failed",
			});
		} finally {
			setPending(false);
		}
	}, []);

	const canReload = machinePhase === "running";

	return (
		<div className="border border-[var(--ret-border)] bg-[var(--ret-bg)] p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<ReticleLabel>PERSIST -- WITHOUT THE CLI</ReticleLabel>
					<h2 className="ret-display mt-1.5 text-base">
						Reload knowledge from GitHub
					</h2>
					<p className="mt-1.5 max-w-[64ch] text-[12px] text-[var(--ret-text-dim)]">
						Edit any{" "}
						<code className="border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1 font-mono text-[0.85em]">
							knowledge/skills/&lt;name&gt;/SKILL.md
						</code>{" "}
						on GitHub. Click here. The VM does{" "}
						<code className="border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1 font-mono text-[0.85em]">
							git fetch + reset + rsync
						</code>{" "}
						against the latest commit on{" "}
						<code className="border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1 font-mono text-[0.85em]">
							main
						</code>{" "}
						and the agent picks it up on the next session.
					</p>
				</div>
				<ReticleButton
					variant="primary"
					size="sm"
					onClick={() => void trigger()}
					disabled={!canReload || pending}
				>
					{pending ? (
						<BrailleSpinner name="cascade" label="Reloading" className="text-sm" />
					) : (
						"Reload now"
					)}
				</ReticleButton>
			</div>

			{!canReload ? (
				<p className="mt-4 font-mono text-[11px] text-[var(--ret-text-muted)]">
					machine is{" "}
					<span className="text-[var(--ret-text-dim)]">{machinePhase ?? "loading"}</span>
					{"-- wait for it to reach"}
					<span className="text-[var(--ret-text-dim)]">running</span>
					{"before reloading."}
				</p>
			) : null}

			{result ? (
				<div className="mt-5 flex flex-col gap-3">
					<div className="flex flex-wrap items-center gap-2">
						{result.ok ? (
							<ReticleBadge variant="success">success</ReticleBadge>
						) : (
							<ReticleBadge variant="warning">{result.error ?? "failed"}</ReticleBadge>
						)}
						{result.head ? (
							<ReticleBadge>HEAD {result.head.slice(0, 7)}</ReticleBadge>
						) : null}
						{result.reloadedAt ? (
							<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
								{new Date(result.reloadedAt).toLocaleTimeString()}
							</span>
						) : null}
					</div>
					{result.message ? (
						<p className="font-mono text-[11px] text-[var(--ret-text-dim)]">
							{result.message}
						</p>
					) : null}
					{result.stdout ? (
						<pre className="max-h-40 overflow-auto border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
							{result.stdout.trim()}
						</pre>
					) : null}
				</div>
			) : null}
		</div>
	);
}
