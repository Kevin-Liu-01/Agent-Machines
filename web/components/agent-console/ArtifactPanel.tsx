"use client";

/**
 * Right panel with tabbed views:
 *
 *   Files/Diffs  -- file tree of changed files with diff viewer
 *   Terminal     -- aggregated shell output from the session
 *   Browser      -- screenshots and browser action results
 *   Scratchpad   -- free-form notes and intermediate output
 *
 * The file tree groups artifacts by path, shows modification indicators
 * (M for modified, + for new), and lets you click through files.
 */

import { useCallback, useMemo, useState } from "react";
import { FileDiff, FileText } from "lucide-react";

import { ReticleButton } from "@/components/reticle/ReticleButton";
import { cn } from "@/lib/cn";
import type { ConversationArtifact } from "@/lib/agents/protocol";

type RightTab = "files" | "terminal" | "browser" | "scratchpad";

type Props = {
	artifacts: ConversationArtifact[];
	selected: ConversationArtifact | null;
	onSelect: (a: ConversationArtifact | null) => void;
	onClose: () => void;
};

export function ArtifactPanel({ artifacts, selected, onSelect, onClose }: Props) {
	const [activeTab, setActiveTab] = useState<RightTab>("files");
	const [scratchpad, setScratchpad] = useState("");

	const fileArtifacts = useMemo(() => artifacts.filter((a) => a.kind === "diff" || a.kind === "file"), [artifacts]);
	const terminalArtifacts = useMemo(() => artifacts.filter((a) => a.kind === "terminal"), [artifacts]);
	const browserArtifacts = useMemo(() => artifacts.filter((a) => a.kind === "screenshot"), [artifacts]);

	const current = selected ?? fileArtifacts[fileArtifacts.length - 1] ?? null;

	const tabs: Array<{ id: RightTab; label: string; count: number }> = [
		{ id: "files", label: "Files", count: fileArtifacts.length },
		{ id: "terminal", label: "Terminal", count: terminalArtifacts.length },
		{ id: "browser", label: "Browser", count: browserArtifacts.length },
		{ id: "scratchpad", label: "Scratchpad", count: scratchpad.length > 0 ? 1 : 0 },
	];

	return (
		<div className="flex h-full flex-col">
			{/* Header with close */}
			<div className="flex shrink-0 items-center justify-between border-b border-[var(--ret-border)] px-3 py-1.5">
				<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
					Artifacts
				</span>
				<ReticleButton variant="secondary" size="sm" onClick={onClose}>
					Close
				</ReticleButton>
			</div>

			{/* Tab bar */}
			<div className="flex shrink-0 gap-px border-b border-[var(--ret-border)] bg-[var(--ret-border)]">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() => setActiveTab(tab.id)}
						className={cn(
							"flex-1 bg-[var(--ret-bg)] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.15em] transition-colors",
							activeTab === tab.id
								? "text-[var(--ret-purple)]"
								: "text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]",
						)}
					>
						{tab.label}
						{tab.count > 0 ? (
							<span className="ml-1 text-[8px]">({tab.count})</span>
						) : null}
					</button>
				))}
			</div>

			{/* Content */}
			<div className="flex-1 overflow-hidden">
				{activeTab === "files" ? (
					<FilesTab
						artifacts={fileArtifacts}
						selected={current}
						onSelect={onSelect}
					/>
				) : activeTab === "terminal" ? (
					<TerminalTab artifacts={terminalArtifacts} />
				) : activeTab === "browser" ? (
					<BrowserTab artifacts={browserArtifacts} />
				) : (
					<ScratchpadTab value={scratchpad} onChange={setScratchpad} />
				)}
			</div>
		</div>
	);
}

/* ── Files tab with tree + viewer ──────────────────────────────────── */

function FilesTab({
	artifacts,
	selected,
	onSelect,
}: {
	artifacts: ConversationArtifact[];
	selected: ConversationArtifact | null;
	onSelect: (a: ConversationArtifact | null) => void;
}) {
	if (artifacts.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-6 font-mono text-[11px] text-[var(--ret-text-muted)]">
				No file changes yet. Diffs and edits will appear here.
			</div>
		);
	}

	const fileTree = useMemo(() => buildFileTree(artifacts), [artifacts]);

	return (
		<div className="flex h-full flex-col">
			{/* File tree */}
			<div className="shrink-0 border-b border-[var(--ret-border)] bg-[var(--ret-bg)]">
				<div className="px-3 py-1.5">
					<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						Changed files
					</span>
					<span className="ml-1.5 font-mono text-[9px] text-[var(--ret-text-muted)]">
						{artifacts.length}
					</span>
				</div>
				<div className="max-h-40 overflow-y-auto">
					{fileTree.map((node) => (
						<FileTreeNode
							key={node.artifact.id}
							node={node}
							selected={selected?.id === node.artifact.id}
							onSelect={() => onSelect(node.artifact)}
						/>
					))}
				</div>
			</div>

			{/* Diff/file viewer */}
			<div className="flex-1 overflow-auto">
				{selected ? (
					<ArtifactViewer artifact={selected} />
				) : artifacts.length > 0 ? (
					<ArtifactViewer artifact={artifacts[artifacts.length - 1]} />
				) : null}
			</div>
		</div>
	);
}

type FileTreeEntry = {
	path: string;
	name: string;
	dir: string;
	kind: "diff" | "file";
	indicator: "M" | "A" | "D" | "?";
	artifact: ConversationArtifact;
};

function buildFileTree(artifacts: ConversationArtifact[]): FileTreeEntry[] {
	return artifacts.map((a) => {
		const path = a.path ?? a.title;
		const parts = path.split("/");
		const name = parts.pop() ?? path;
		const dir = parts.join("/");
		let indicator: FileTreeEntry["indicator"] = "?";
		if (a.kind === "diff") {
			const content = a.content;
			const hasAdd = content.includes("\n+") || content.startsWith("+");
			const hasDel = content.includes("\n-") || content.startsWith("-");
			if (hasAdd && hasDel) indicator = "M";
			else if (hasAdd) indicator = "A";
			else if (hasDel) indicator = "D";
			else indicator = "M";
		} else {
			indicator = "A";
		}
		return { path, name, dir, kind: a.kind as "diff" | "file", indicator, artifact: a };
	});
}

function FileTreeNode({
	node,
	selected,
	onSelect,
}: {
	node: FileTreeEntry;
	selected: boolean;
	onSelect: () => void;
}) {
	const indicatorColor =
		node.indicator === "A" ? "text-[var(--ret-green)]"
			: node.indicator === "D" ? "text-[var(--ret-red)]"
				: "text-[var(--ret-amber)]";

	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"flex w-full items-center gap-2 px-3 py-1 text-left transition-colors",
				selected ? "bg-[var(--ret-purple-glow)]" : "hover:bg-[var(--ret-surface)]",
			)}
		>
			<span className="shrink-0 text-[var(--ret-text-muted)]">
				{node.kind === "diff" ? <FileDiff className="h-3 w-3" strokeWidth={1.75} /> : <FileText className="h-3 w-3" strokeWidth={1.75} />}
			</span>
			<span className={cn(
				"flex-1 truncate font-mono text-[11px]",
				selected ? "text-[var(--ret-purple)]" : "text-[var(--ret-text)]",
			)}>
				{node.dir ? (
					<span className="text-[var(--ret-text-muted)]">{node.dir}/</span>
				) : null}
				{node.name}
			</span>
			<span className={cn("shrink-0 font-mono text-[9px] font-bold", indicatorColor)}>
				{node.indicator}
			</span>
		</button>
	);
}

/* ── Terminal tab ──────────────────────────────────────────────────── */

function TerminalTab({ artifacts }: { artifacts: ConversationArtifact[] }) {
	if (artifacts.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-6 font-mono text-[11px] text-[var(--ret-text-muted)]">
				No terminal output yet. Shell commands will appear here.
			</div>
		);
	}

	return (
		<div className="h-full overflow-auto bg-black/30 p-3">
			{artifacts.map((a) => (
				<div key={a.id} className="mb-4">
					<div className="mb-1 flex items-center gap-2">
						<span className="font-mono text-[9px] text-[var(--ret-green)]">$</span>
						<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">{a.title}</span>
					</div>
					<pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[var(--ret-green)]/80">
						{a.content}
					</pre>
				</div>
			))}
		</div>
	);
}

/* ── Browser tab ───────────────────────────────────────────────────── */

function BrowserTab({ artifacts }: { artifacts: ConversationArtifact[] }) {
	if (artifacts.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-6 font-mono text-[11px] text-[var(--ret-text-muted)]">
				No browser captures yet. Screenshots will appear here.
			</div>
		);
	}

	return (
		<div className="h-full overflow-auto p-3">
			{artifacts.map((a) => (
				<div key={a.id} className="mb-4 border border-[var(--ret-border)]">
					<div className="border-b border-[var(--ret-border)] bg-[var(--ret-surface)] px-3 py-1.5">
						<p className="font-mono text-[10px] text-[var(--ret-text-muted)]">{a.title}</p>
					</div>
					{a.content.startsWith("http") || a.content.startsWith("data:") ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img src={a.content} alt={a.title} className="w-full" />
					) : (
						<pre className="p-3 font-mono text-[11px] text-[var(--ret-text-dim)]">
							{a.content.slice(0, 500)}
						</pre>
					)}
				</div>
			))}
		</div>
	);
}

/* ── Scratchpad tab ────────────────────────────────────────────────── */

function ScratchpadTab({
	value,
	onChange,
}: {
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<div className="flex h-full flex-col">
			<div className="shrink-0 border-b border-[var(--ret-border)] px-3 py-1.5">
				<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					Session scratchpad
				</span>
				<span className="ml-2 text-[9px] text-[var(--ret-text-dim)]">
					Notes and intermediate output
				</span>
			</div>
			<textarea
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder="Paste notes, intermediate results, or context here..."
				className={cn(
					"flex-1 resize-none bg-[var(--ret-bg)] p-4",
					"font-mono text-[12px] leading-relaxed text-[var(--ret-text)]",
					"placeholder:text-[var(--ret-text-muted)]",
					"focus:outline-none",
				)}
			/>
		</div>
	);
}

/* ── Shared viewer ─────────────────────────────────────────────────── */

function ArtifactViewer({ artifact }: { artifact: ConversationArtifact }) {
	if (artifact.kind === "diff") return <DiffViewer artifact={artifact} />;
	return <FileViewer artifact={artifact} />;
}

function DiffViewer({ artifact }: { artifact: ConversationArtifact }) {
	const lines = artifact.content.split("\n");

	// Count additions and deletions
	const stats = useMemo(() => {
		let adds = 0;
		let dels = 0;
		for (const line of lines) {
			if (line.startsWith("+") && !line.startsWith("+++")) adds++;
			else if (line.startsWith("-") && !line.startsWith("---")) dels++;
		}
		return { adds, dels };
	}, [lines]);

	return (
		<div>
			{/* File header */}
			<div className="flex items-center justify-between border-b border-[var(--ret-border)] bg-[var(--ret-surface)] px-4 py-2">
				<div>
					<p className="font-mono text-[12px] text-[var(--ret-text)]">{artifact.path ?? artifact.title}</p>
					{artifact.language ? (
						<span className="font-mono text-[9px] uppercase text-[var(--ret-text-muted)]">{artifact.language}</span>
					) : null}
				</div>
				<div className="flex items-center gap-2">
					<span className="font-mono text-[10px] text-[var(--ret-green)]">+{stats.adds}</span>
					<span className="font-mono text-[10px] text-[var(--ret-red)]">-{stats.dels}</span>
				</div>
			</div>

			{/* Diff lines */}
			<div className="overflow-auto">
				<table className="w-full border-collapse font-mono text-[11px] leading-relaxed">
					<tbody>
						{lines.map((line, i) => {
							const isAdd = line.startsWith("+") && !line.startsWith("+++");
							const isDel = line.startsWith("-") && !line.startsWith("---");
							const isHunk = line.startsWith("@@");
							const isMeta = line.startsWith("---") || line.startsWith("+++") || line.startsWith("diff ");

							return (
								<tr key={i} className={cn(
									isAdd ? "bg-[var(--ret-green)]/8" : "",
									isDel ? "bg-[var(--ret-red)]/8" : "",
									isHunk ? "bg-[var(--ret-purple)]/5" : "",
								)}>
									<td className="w-px select-none whitespace-nowrap border-r border-[var(--ret-border)]/30 px-2 text-right text-[var(--ret-text-muted)]">
										{!isMeta && !isHunk ? i + 1 : ""}
									</td>
									<td className={cn(
										"whitespace-pre-wrap px-3 py-px",
										isAdd ? "text-[var(--ret-green)]" : "",
										isDel ? "text-[var(--ret-red)]" : "",
										isHunk ? "text-[var(--ret-purple)]" : "",
										isMeta ? "text-[var(--ret-text-muted)]" : "",
										!isAdd && !isDel && !isHunk && !isMeta ? "text-[var(--ret-text-dim)]" : "",
									)}>
										{line}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function FileViewer({ artifact }: { artifact: ConversationArtifact }) {
	const lines = artifact.content.split("\n");

	return (
		<div>
			<div className="border-b border-[var(--ret-border)] bg-[var(--ret-surface)] px-4 py-2">
				<p className="font-mono text-[12px] text-[var(--ret-text)]">{artifact.path ?? artifact.title}</p>
				{artifact.language ? (
					<span className="font-mono text-[9px] uppercase text-[var(--ret-text-muted)]">{artifact.language}</span>
				) : null}
			</div>
			<div className="overflow-auto">
				<table className="w-full border-collapse font-mono text-[11px] leading-relaxed">
					<tbody>
						{lines.map((line, i) => (
							<tr key={i} className="hover:bg-[var(--ret-surface)]">
								<td className="w-px select-none whitespace-nowrap border-r border-[var(--ret-border)]/30 px-2 text-right text-[var(--ret-text-muted)]">
									{i + 1}
								</td>
								<td className="whitespace-pre-wrap px-3 py-px text-[var(--ret-text-dim)]">{line}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
