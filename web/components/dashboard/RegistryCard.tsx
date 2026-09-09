"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import type { RegistryItem } from "@/lib/dashboard/registry";
import type { RegistryInstallOutcome } from "@/lib/dashboard/registry/types";

import { RegistryLogo } from "./RegistryLogo";

const KIND_BADGE: Record<string, "default" | "accent" | "success" | "warning"> = {
	skill: "accent",
	mcp: "success",
	cli: "warning",
	tool: "default",
	plugin: "accent",
	provider: "success",
	source: "default",
};

type Props = {
	item: RegistryItem;
	targetId: string;
	onAdd: (item: RegistryItem, install?: boolean) => Promise<RegistryInstallOutcome>;
	onRemove: (itemId: string) => Promise<void>;
};

export function RegistryCard({ item, targetId, onAdd, onRemove }: Props) {
	const [pending, setPending] = useState(false);
	const [installed, setInstalled] = useState(item.installed);
	const [error, setError] = useState<string | null>(null);
	const [outcome, setOutcome] = useState<RegistryInstallOutcome | null>(null);
	const canInstall = Boolean(item.installCommand?.trim()) && ["skill", "cli", "tool"].includes(item.kind);
	useEffect(() => setInstalled(item.installed), [item.installed]);

	async function handleAdd(install = false) {
		setPending(true);
		setError(null);
		try {
			setOutcome(await onAdd(item, install));
			setInstalled(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to add");
		} finally {
			setPending(false);
		}
	}

	async function handleRemove() {
		setPending(true);
		setError(null);
		try {
			await onRemove(item.id);
			setInstalled(false);
			setOutcome(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to remove");
		} finally {
			setPending(false);
		}
	}

	const Header = (
		<div className="flex min-w-0 items-center gap-2">
			<RegistryLogo
				brand={item.brand}
				logoUrl={item.logoUrl}
				kind={item.kind}
				name={item.name}
				homepage={item.homepage}
				size={16}
			/>
			<span className="truncate font-mono text-[12px] text-[var(--ret-text)]">
				{item.name}
			</span>
		</div>
	);

	return (
		<ReticleFrame>
			<div className="flex items-start justify-between gap-2 border-b border-[var(--ret-border)] px-3 py-2">
				{item.homepage ? (
					<a
						href={item.homepage}
						target="_blank"
						rel="noreferrer"
						className="min-w-0 transition-opacity hover:opacity-80"
						title={`Open source — ${item.homepage}`}
					>
						{Header}
					</a>
				) : (
					Header
				)}
				<ReticleBadge variant={KIND_BADGE[item.kind] ?? "default"} className="shrink-0 text-[10px]">
					{item.kind}
				</ReticleBadge>
			</div>
			<div className="flex flex-1 flex-col gap-2 p-3">
				<p className="line-clamp-3 text-[11px] leading-relaxed text-[var(--ret-text-dim)]">
					{item.description}
				</p>
				<div className="mt-auto grid gap-1 border-t border-[var(--ret-border)] pt-2 font-mono text-[10px] text-[var(--ret-text-muted)]">
					<p className="truncate">
						<span className="uppercase tracking-[0.16em]">provider</span>{" "}
						<span className="text-[var(--ret-text-dim)]">{item.provider}</span>
					</p>
					<p className="truncate">
						<span className="uppercase tracking-[0.16em]">source</span>{" "}
						<span className="text-[var(--ret-text-dim)]">{item.source}</span>
					</p>
					{item.version ? (
						<p className="truncate">
							<span className="uppercase tracking-[0.16em]">version</span>{" "}
							<span className="text-[var(--ret-text-dim)]">{item.version}</span>
						</p>
					) : null}
					{item.stars ? (
						<p className="truncate">
							<span className="uppercase tracking-[0.16em]">
								{item.source === "npm" ? "popularity" : "stars"}
							</span>{" "}
							<span className="text-[var(--ret-text-dim)]">
								{item.stars.toLocaleString()}
							</span>
						</p>
					) : null}
				</div>
				<div className="flex items-center justify-between gap-2 pt-1">
					{item.homepage ? (
						<a
							href={item.homepage}
							target="_blank"
							rel="noreferrer"
							className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-accent)] hover:underline"
						>
							source <ExternalLink className="inline h-2.5 w-2.5" strokeWidth={1.75} aria-hidden />
						</a>
					) : (
						<span />
					)}
					{installed ? (
						<button
							type="button"
							onClick={() => void handleRemove()}
							disabled={pending}
							className="border border-[var(--ret-green)]/40 bg-[var(--ret-green)]/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ret-green)] transition-colors hover:border-[var(--ret-red)]/40 hover:bg-[var(--ret-red)]/10 hover:text-[var(--ret-red)] disabled:opacity-50"
						>
							{pending ? "Saving…" : "Remove from library"}
						</button>
					) : (
						<button
							type="button"
							onClick={() => void handleAdd()}
							disabled={pending}
							className="border border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ret-purple)] transition-colors hover:bg-[var(--ret-purple)]/20 disabled:opacity-50"
						>
							{pending ? "Saving…" : "Save to library"}
						</button>
					)}
				</div>
				{canInstall ? (
					<details className="border-t border-[var(--ret-border)] pt-2 text-xs text-[var(--ret-text-dim)]">
						<summary className="cursor-pointer py-1">Review install command</summary>
						<pre className="my-2 max-h-32 overflow-auto whitespace-pre-wrap break-all bg-[var(--ret-bg)] p-2 text-[11px]">{item.installCommand}</pre>
						<p className="mb-2">This third-party command runs with the selected Worker’s permissions. Review it before continuing.</p>
						<button type="button" disabled={pending || !targetId} onClick={() => void handleAdd(true)} className="rounded border border-[var(--ret-border)] px-3 py-2 text-[var(--ret-text)] disabled:opacity-50">
							{pending ? "Working…" : "Run on selected Worker"}
						</button>
						{!targetId ? <p className="mt-1">Choose an installation target above.</p> : null}
					</details>
				) : <p className="text-xs text-[var(--ret-text-muted)]">Library entry only. Check the source for setup, credentials, and runtime support.</p>}
				{outcome ? <div role="status" className="border-t border-[var(--ret-border)] pt-2 text-xs text-[var(--ret-text-dim)]">
					{outcome.machineId ? <p>Target: <span className="break-all">{outcome.machineId}</span></p> : null}
					<pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans">{outcome.installLog}</pre>
				</div> : null}
				{error ? (
					<p className="text-[10px] text-[var(--ret-red)]">{error}</p>
				) : null}
			</div>
		</ReticleFrame>
	);
}
