"use client";

import { MessageSquare, Terminal, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { LiveDataView } from "@/components/dashboard/LiveDataView";
import { useOptionalMachineContext } from "@/components/dashboard/MachineProvider";
import { formatAge, formatBytes } from "@/lib/dashboard/format";
import type { SessionRecord, SessionsPayload, SessionTranscriptPayload } from "@/lib/dashboard/types";

const MACHINE_PATH_RE = /^\/dashboard\/machines\/([^/]+)/;
const RUNTIME_NAMES: Record<SessionRecord["runtime"], string> = {
	"claude-code": "Claude Code", codex: "Codex", openclaw: "OpenClaw", hermes: "Hermes",
};

function HistoryWarnings({ warnings }: { warnings: string[] }) {
	if (!warnings.length) return null;
	return <div role="status" className="mb-4 space-y-1 border-l-2 border-amber-500/50 bg-amber-500/5 px-4 py-3 text-xs text-[var(--ret-text-dim)]">
		{warnings.map((warning) => <p key={warning}>{warning}</p>)}
	</div>;
}

function SessionTranscript({ data }: { data: SessionTranscriptPayload }) {
	return <div className="p-4 sm:p-6">
		<p className="mb-4 break-all text-xs text-[var(--ret-text-muted)]">{data.session.source}</p>
		<HistoryWarnings warnings={data.warnings} />
		{data.truncated && <p role="status" className="mb-4 text-xs text-amber-500">Showing the latest readable excerpt, up to 200 messages. Long messages and histories are truncated.</p>}
		{data.messages.length === 0 ? <p className="py-6 text-sm text-[var(--ret-text-dim)]">This history has no readable conversation messages yet. The runtime may still be writing it.</p> : <ol className="space-y-4">
			{data.messages.map((message, index) => <li key={`${index}-${message.at}`} className={`rounded-md border border-[var(--ret-border)] p-4 ${message.role === "user" ? "bg-[var(--ret-bg-soft)]" : "bg-[var(--ret-bg)]"}`}>
				<div className="mb-2 flex items-center gap-2 text-xs font-medium text-[var(--ret-text-dim)]">
					{message.role === "tool" ? <Terminal size={14} aria-hidden="true" /> : <MessageSquare size={14} aria-hidden="true" />}
					<span>{message.role === "user" ? "You" : message.role === "assistant" ? RUNTIME_NAMES[data.session.runtime] : message.toolName || "Tool result"}</span>
					{message.at && <span className="ml-auto font-normal text-[var(--ret-text-muted)]">{formatAge(message.at)}</span>}
				</div>
				<p className={`whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--ret-text)] ${message.role === "tool" ? "font-mono text-xs" : ""}`}>{message.text}</p>
				{message.truncated && <p className="mt-2 text-xs text-[var(--ret-text-muted)]">Message truncated.</p>}
			</li>)}
		</ol>}
	</div>;
}

function History({ data, fetchedAt, endpoint, machineId }: { data: SessionsPayload; fetchedAt: string; endpoint: string; machineId?: string }) {
	const [selected, setSelected] = useState<SessionRecord | null>(null);
	const workHref = machineId ? `/dashboard/machines/${encodeURIComponent(machineId)}/view` : "/dashboard/machines";
	return <div className="px-4 py-6 sm:px-6">
		<div className="mb-5 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-xs text-[var(--ret-text-dim)]">
			<span>{data.totalSessions} saved {data.totalSessions === 1 ? "session" : "sessions"}</span>
			<span>{formatBytes(data.totalBytes)} on disk</span>
			<span className="ml-auto text-[var(--ret-text-muted)]">Refreshed {formatAge(fetchedAt)}</span>
		</div>
		<HistoryWarnings warnings={data.warnings} />
		{data.sessions.length === 0 ? <div className="rounded-md border border-dashed border-[var(--ret-border)] px-6 py-8 text-center text-sm text-[var(--ret-text-dim)]">
			No saved runtime conversations on this machine yet. <a href={workHref} className="underline">Open the live runtime</a> and complete a conversation. Only histories actually saved by the runtime appear here.
		</div> : <div className="overflow-x-auto rounded-md border border-[var(--ret-border)]">
			<table className="w-full border-collapse text-sm">
				<thead className="bg-[var(--ret-bg-soft)] text-xs text-[var(--ret-text-muted)]"><tr>
					<th className="px-4 py-3 text-left font-medium">Conversation</th>
					<th className="px-4 py-3 text-left font-medium">Runtime</th>
					<th className="px-4 py-3 text-right font-medium">Updated</th>
				</tr></thead>
				<tbody className="divide-y divide-[var(--ret-border)]">{data.sessions.map((session) => <tr key={session.id} className={selected?.id === session.id ? "bg-[var(--ret-bg-soft)]" : "bg-[var(--ret-bg)] hover:bg-[var(--ret-surface)]"}>
					<td className="max-w-[480px] px-4 py-3"><button type="button" aria-pressed={selected?.id === session.id} onClick={() => setSelected(session)} className="block w-full truncate rounded-sm text-left text-[var(--ret-purple)] outline-offset-4 focus-visible:outline-2" title={session.preview}>
						{session.preview}
					</button><span className="mt-1 block truncate text-[10px] text-[var(--ret-text-muted)]">{session.source}</span></td>
					<td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--ret-text-dim)]">{RUNTIME_NAMES[session.runtime]}</td>
					<td className="whitespace-nowrap px-4 py-3 text-right text-xs text-[var(--ret-text-muted)]">{formatAge(session.updatedAt)}</td>
				</tr>)}</tbody>
			</table>
		</div>}
		{selected && <section aria-label="Selected conversation" className="mt-6 rounded-md border border-[var(--ret-border)]">
			<div className="flex items-center gap-4 border-b border-[var(--ret-border)] px-4 py-3">
				<h2 className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--ret-text)]">{selected.preview}</h2>
				<button type="button" aria-label="Close conversation" onClick={() => setSelected(null)} className="rounded p-1 text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]"><X size={16} /></button>
			</div>
			<LiveDataView<SessionTranscriptPayload> key={selected.id} endpoint={`${endpoint}${endpoint.includes("?") ? "&" : "?"}sessionId=${selected.id}`} render={(transcript) => <SessionTranscript data={transcript} />} />
		</section>}
	</div>;
}

export function SessionsList() {
	const pathname = usePathname();
	const machineCtx = useOptionalMachineContext();
	const machineMatch = MACHINE_PATH_RE.exec(pathname);
	const machineId = machineCtx?.machineId ?? machineMatch?.[1];
	const endpoint = machineId ? `/api/dashboard/sessions?machineId=${encodeURIComponent(machineId)}` : "/api/dashboard/sessions";
	return <LiveDataView<SessionsPayload> key={endpoint} endpoint={endpoint} pollMs={30_000} render={(data, fetchedAt) => <History key={endpoint} data={data} fetchedAt={fetchedAt} endpoint={endpoint} machineId={machineId} />} />;
}
