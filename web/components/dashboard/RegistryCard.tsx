"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, CheckCircle2, ChevronDown, ExternalLink, LoaderCircle, Plus, Terminal, Trash2 } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { RegistryItem } from "@/lib/dashboard/registry";
import type { RegistryInstallOutcome } from "@/lib/dashboard/registry/types";
import { RegistryLogo } from "./RegistryLogo";

const KIND_LABEL: Record<string, string> = {
	skill: "Skill", mcp: "MCP server", cli: "CLI", tool: "Tool",
	plugin: "Plugin", provider: "Provider", source: "Source",
};
const SOURCE_LABEL: Record<string, string> = {
	bundled: "Bundled catalog", "skills-sh": "skills.sh", "mcp-registry": "MCP Registry",
	npm: "npm", "cursor-plugins": "Cursor plugins", "github-repo": "GitHub", "url-manifest": "URL manifest",
};
const OUTCOME_LABEL: Record<RegistryInstallOutcome["status"], string> = {
	saved: "Saved to library", manual_setup: "Manual setup required", machine_offline: "Worker is offline",
	command_succeeded: "Command completed", failed: "Installation failed",
};
type Props = {
	item: RegistryItem;
	targetId: string;
	targetName?: string;
	installBusy?: boolean;
	onAdd: (item: RegistryItem, install?: boolean) => Promise<RegistryInstallOutcome>;
	onRemove: (itemId: string) => Promise<void>;
};
const action = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--ret-border)] px-3 py-2 text-sm font-medium transition-colors duration-150 hover:bg-[var(--ret-surface)] focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-50";

function sourceLink(value: string | null): string | null {
	if (!value) return null;
	try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}

export function RegistryCard({ item, targetId, targetName, installBusy = false, onAdd, onRemove }: Props) {
	const [pending, setPending] = useState<"save" | "install" | "remove" | null>(null);
	const [saved, setSaved] = useState(item.installed);
	const [error, setError] = useState<string | null>(null);
	const [outcome, setOutcome] = useState<RegistryInstallOutcome | null>(null);
	const [removed, setRemoved] = useState(false);
	const lock = useRef(false);
	const canInstall = Boolean(item.installCommand?.trim()) && ["skill", "cli", "tool"].includes(item.kind);
	const homepage = sourceLink(item.homepage);
	useEffect(() => setSaved(item.installed), [item.installed]);

	async function handleAdd(install = false) {
		if (lock.current || installBusy || (install && (!targetId || !canInstall))) return;
		lock.current = true;
		setPending(install ? "install" : "save");
		setError(null); setRemoved(false); setOutcome(null);
		try {
			const result = await onAdd(item, install);
			if (!result || !Object.hasOwn(OUTCOME_LABEL, result.status) || typeof result.installLog !== "string") throw new Error("The save status could not be confirmed. Refresh your library before retrying.");
			setOutcome(result);
			setSaved(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not save this item. Please try again.");
		} finally { lock.current = false; setPending(null); }
	}
	async function handleRemove() {
		if (lock.current || installBusy) return;
		lock.current = true;
		setPending("remove"); setError(null);
		try {
			await onRemove(item.id);
			setSaved(false); setOutcome(null); setRemoved(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not remove this item. Please try again.");
		} finally { lock.current = false; setPending(null); }
	}
	const blocked = Boolean(pending) || installBusy;
	const warning = outcome && ["failed", "machine_offline", "manual_setup"].includes(outcome.status);

	return (
		<article aria-label={item.name} aria-busy={Boolean(pending)} className={cn("flex h-full min-w-0 flex-col rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg)] transition-colors duration-150 hover:border-[var(--ret-text-muted)]")}>
			<div className={cn("flex items-start gap-3.5 p-5 pb-4")}>
				<div className={cn("grid size-11 shrink-0 place-items-center rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]")}>
					<RegistryLogo brand={item.brand} logoUrl={item.logoUrl} kind={item.kind} name={item.name} homepage={item.homepage} size={26} />
				</div>
				<div className={cn("min-w-0 flex-1")}>
					<h2 className={cn("break-words text-lg font-semibold leading-6 tracking-tight [overflow-wrap:anywhere]")}>{item.name}</h2>
					<p className={cn("mt-1 text-xs text-[var(--ret-text-muted)]")}>{KIND_LABEL[item.kind] ?? item.kind}<span aria-hidden="true" className={cn("px-1.5")}>·</span>{SOURCE_LABEL[item.source] ?? item.source}</p>
				</div>
				{saved ? <Check className={cn("mt-1 size-4 shrink-0 text-[var(--ret-text-dim)]")} aria-label="Saved to library" /> : null}
			</div>
			<div className={cn("flex flex-1 flex-col px-5 pb-5")}>
				<p className={cn("min-h-16 line-clamp-3 break-words text-sm leading-6 text-[var(--ret-text-dim)]")}>{item.description || "No description supplied. Review the source before adding this item."}</p>
				{item.description.length > 170 ? <details className={cn("mt-1 text-sm text-[var(--ret-text-dim)]")}><summary className={cn("w-fit cursor-pointer rounded py-1 text-xs text-[var(--ret-text-muted)] hover:text-[var(--ret-text)] focus-visible:outline-2")}>Read full description</summary><p className={cn("mt-2 break-words leading-6")}>{item.description}</p></details> : null}
				<div className={cn("mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-xs text-[var(--ret-text-muted)]")}>
					<span className={cn("max-w-full truncate")} title={item.provider}>{item.provider}</span>
					{item.version ? <span className={cn("max-w-full truncate font-mono")} title={item.version}>v{item.version.replace(/^v/, "")}</span> : null}
					{item.stars ? <span className={cn("tabular-nums")}>{item.stars.toLocaleString()} {item.source === "npm" ? "popularity" : "stars"}</span> : null}
				</div>
				<div className={cn("mt-4 flex flex-wrap items-center justify-between gap-2")}>
					{homepage ? <a href={homepage} target="_blank" rel="noreferrer" aria-label={"View source for " + item.name} className={cn("inline-flex min-h-10 items-center gap-1.5 rounded text-sm text-[var(--ret-text-dim)] hover:text-[var(--ret-text)] focus-visible:outline-2")}>View source<ExternalLink className={cn("size-3.5")} aria-hidden="true" /></a> : <span className={cn("text-xs text-[var(--ret-text-muted)]")}>No source link</span>}
					{saved ? <button type="button" onClick={() => void handleRemove()} disabled={blocked} title="Remove the library entry only. Files already on a Worker are not removed." className={cn(action, "text-[var(--ret-text-dim)] hover:text-[var(--ret-red)]")}>{pending === "remove" ? <LoaderCircle className={cn("size-4 motion-safe:animate-spin")} aria-hidden="true" /> : <Trash2 className={cn("size-4")} aria-hidden="true" />}{pending === "remove" ? "Removing…" : "Remove from library"}</button> : <button type="button" onClick={() => void handleAdd()} disabled={blocked} className={cn(action, "bg-[var(--ret-surface)] text-[var(--ret-text)]")}>{pending === "save" ? <LoaderCircle className={cn("size-4 motion-safe:animate-spin")} aria-hidden="true" /> : <Plus className={cn("size-4")} aria-hidden="true" />}{pending === "save" ? "Saving…" : "Save to library"}</button>}
				</div>
			</div>
			{canInstall ? <details className={cn("group border-t border-[var(--ret-border)] bg-[var(--ret-bg-soft)]")}>
				<summary className={cn("flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-b-lg px-5 py-3 text-sm text-[var(--ret-text-dim)] hover:text-[var(--ret-text)] focus-visible:outline-2 [&::-webkit-details-marker]:hidden")}><Terminal className={cn("size-4 shrink-0")} aria-hidden="true" />Review install command<ChevronDown className={cn("ml-auto size-4 shrink-0 group-open:rotate-180")} aria-hidden="true" /></summary>
				<div className={cn("space-y-3 px-5 pb-5")}>
					<pre className={cn("max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border border-[var(--ret-border)] bg-[var(--ret-bg)] p-3 font-mono text-xs leading-6")}>{item.installCommand}</pre>
					<p className={cn("text-sm leading-6 text-[var(--ret-text-dim)]")}>This third-party command runs with the selected Worker’s permissions. Review it before continuing.</p>
					{targetId ? <p className={cn("break-words text-sm")}><span className={cn("text-[var(--ret-text-muted)]")}>Target: </span>{targetName ?? targetId}</p> : <p className={cn("text-sm text-[var(--ret-text-muted)]")}>Choose an installation target above. You can save this item without one.</p>}
					<button type="button" disabled={blocked || !targetId} onClick={() => void handleAdd(true)} className={cn(action, "w-full bg-[var(--ret-text)] text-[var(--ret-bg)] hover:bg-[var(--ret-text-dim)]")}>{pending === "install" ? <LoaderCircle className={cn("size-4 motion-safe:animate-spin")} aria-hidden="true" /> : <Terminal className={cn("size-4")} aria-hidden="true" />}{pending === "install" ? "Installing…" : "Run on selected Worker"}</button>
				</div>
			</details> : <div className={cn("flex items-start gap-2 rounded-b-lg border-t border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-5 py-3 text-xs leading-5 text-[var(--ret-text-muted)]")}><ExternalLink className={cn("mt-0.5 size-3.5 shrink-0")} aria-hidden="true" /><p>Manual setup. Follow the source for credentials and runtime configuration.</p></div>}
			{outcome ? <div role="status" className={cn("border-t border-[var(--ret-border)] p-5 text-sm")}>
				<p className={cn("mb-2 flex items-center gap-2 font-semibold", warning ? "text-[var(--ret-amber)]" : "text-[var(--ret-text)]")}>{warning ? <AlertCircle className={cn("size-4")} aria-hidden="true" /> : <CheckCircle2 className={cn("size-4")} aria-hidden="true" />}{OUTCOME_LABEL[outcome.status]}</p>
				{outcome.machineId ? <p className={cn("mb-2 break-all text-xs text-[var(--ret-text-muted)]")}>Target: {outcome.machineId === targetId ? targetName ?? outcome.machineId : outcome.machineId}</p> : null}
				<pre className={cn("max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-6 text-[var(--ret-text-dim)]")}>{outcome.installLog}</pre>
			</div> : null}
			{removed ? <p role="status" className={cn("border-t border-[var(--ret-border)] p-5 text-sm leading-6 text-[var(--ret-text-dim)]")}>Removed from your library. Existing Worker files were not changed.</p> : null}
			{error ? <p role="alert" className={cn("border-t border-[var(--ret-border)] p-5 text-sm leading-6 text-[var(--ret-red)]")}>{error}</p> : null}
		</article>
	);
}
