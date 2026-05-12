"use client";

import { useState } from "react";

import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import type { RegistryItem } from "@/lib/dashboard/registry";

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
	onAdd: (item: RegistryItem) => Promise<void>;
	onRemove: (itemId: string) => Promise<void>;
};

export function RegistryCard({ item, onAdd, onRemove }: Props) {
	const [pending, setPending] = useState(false);
	const [installed, setInstalled] = useState(item.installed);
	const [error, setError] = useState<string | null>(null);

	async function handleAdd() {
		setPending(true);
		setError(null);
		try {
			await onAdd(item);
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
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to remove");
		} finally {
			setPending(false);
		}
	}

	return (
		<ReticleFrame>
			<div className="flex items-start justify-between gap-2 border-b border-[var(--ret-border)] px-3 py-2">
				<div className="flex min-w-0 items-center gap-2">
					<RegistryLogo
						brand={item.brand}
						logoUrl={item.logoUrl}
						kind={item.kind}
						name={item.name}
						size={16}
					/>
					<span className="truncate font-mono text-[12px] text-[var(--ret-text)]">
						{item.name}
					</span>
				</div>
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
							className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-purple)] hover:underline"
						>
							docs
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
							{pending ? "..." : "installed"}
						</button>
					) : (
						<button
							type="button"
							onClick={() => void handleAdd()}
							disabled={pending}
							className="border border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ret-purple)] transition-colors hover:bg-[var(--ret-purple)]/20 disabled:opacity-50"
						>
							{pending ? "adding..." : "add"}
						</button>
					)}
				</div>
				{error ? (
					<p className="font-mono text-[10px] text-[var(--ret-red)]">{error}</p>
				) : null}
			</div>
		</ReticleFrame>
	);
}
