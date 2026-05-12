"use client";

import { LiveDataView } from "@/components/dashboard/LiveDataView";
import { formatAge, formatBytes } from "@/lib/dashboard/format";
import type { SessionsPayload } from "@/lib/dashboard/types";

export function SessionsList() {
	return (
		<LiveDataView<SessionsPayload>
			endpoint="/api/dashboard/sessions"
			pollMs={30_000}
			offlineHint={"# the dashboard reads:\nfind ~/.agent-machines/sessions -name '*.db'"}
			render={(data, fetchedAt) => (
				<div className="px-6 py-6">
					<div className="mb-5 flex flex-wrap items-baseline gap-x-6 gap-y-1 font-mono text-[11px] text-[var(--ret-text-dim)]">
						<span>
							<span className="text-[var(--ret-text-muted)]">total</span>{" "}
							{data.totalSessions}
						</span>
						<span>
							<span className="text-[var(--ret-text-muted)]">size</span>{" "}
							{formatBytes(data.totalBytes)}
						</span>
						<span>
							<span className="text-[var(--ret-text-muted)]">db</span>{" "}
							{data.dbPath}
						</span>
						<span className="ml-auto text-[var(--ret-text-muted)]">
							refreshed {formatAge(fetchedAt)}
						</span>
					</div>

					{data.sessions.length === 0 ? (
						<div className="border border-dashed border-[var(--ret-border)] bg-[var(--ret-bg)] px-6 py-8 text-center text-sm text-[var(--ret-text-dim)]">
							No sessions on this machine yet. Open{" "}
							<a href="/dashboard/chat" className="underline">
								chat
							</a>{" "}
							and say hi.
						</div>
					) : (
						<div className="overflow-hidden border border-[var(--ret-border)]">
							<table className="w-full border-collapse text-sm tabular-nums">
								<thead className="bg-[var(--ret-bg-soft)] font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
									<tr>
										<th className="px-4 py-2.5 text-left">id</th>
										<th className="px-4 py-2.5 text-left">file</th>
										<th className="px-4 py-2.5 text-right">size</th>
										<th className="px-4 py-2.5 text-right">updated</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-[var(--ret-border)]">
									{data.sessions.map((s) => (
										<tr
											key={s.id}
											className="bg-[var(--ret-bg)] transition-colors hover:bg-[var(--ret-surface)]"
										>
											<td className="max-w-[280px] truncate px-4 py-3 font-mono text-[12px] text-[var(--ret-purple)]">
												{s.id}
											</td>
											<td className="max-w-[280px] truncate px-4 py-3 font-mono text-[11px] text-[var(--ret-text-dim)]">
												{s.preview}
											</td>
											<td className="px-4 py-3 text-right font-mono text-[12px] text-[var(--ret-text-dim)]">
												{formatBytes(s.bytes)}
											</td>
											<td className="px-4 py-3 text-right font-mono text-[11px] text-[var(--ret-text-muted)]">
												{formatAge(s.updatedAt)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}
		/>
	);
}
