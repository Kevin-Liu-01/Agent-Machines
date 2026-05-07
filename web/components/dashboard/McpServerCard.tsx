import type { McpServerSummary } from "@/lib/dashboard/types";

type Props = {
	server: McpServerSummary;
};

export function McpServerCard({ server }: Props) {
	return (
		<article className="rounded-[var(--ret-card-radius)] border border-[var(--ret-border)] bg-[var(--ret-bg)]">
			<header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--ret-border)] px-5 py-4">
				<div className="min-w-0">
					<p className="font-mono text-sm text-[var(--ret-purple)]">
						{server.name}
					</p>
					<p className="mt-0.5 font-mono text-[11px] text-[var(--ret-text-muted)]">
						{server.source}
					</p>
				</div>
				<div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em]">
					<span className="rounded-full border border-[var(--ret-border)] bg-[var(--ret-surface)] px-2 py-0.5 text-[var(--ret-text-dim)]">
						{server.transport}
					</span>
					<span className="rounded-full border border-[var(--ret-border)] bg-[var(--ret-surface)] px-2 py-0.5 text-[var(--ret-text-dim)]">
						{server.tools.length} tools
					</span>
				</div>
			</header>
			<ul className="divide-y divide-[var(--ret-border)]">
				{server.tools.map((tool) => (
					<li
						key={tool.name}
						className="grid grid-cols-1 gap-2 px-5 py-4 md:grid-cols-[200px_1fr]"
					>
						<div>
							<p className="font-mono text-[13px] text-[var(--ret-text)]">
								{tool.name}
							</p>
							<p className="mt-0.5 text-[11px] text-[var(--ret-text-muted)]">
								{tool.title}
							</p>
						</div>
						<p className="text-sm text-[var(--ret-text-dim)]">
							{tool.description}
						</p>
					</li>
				))}
			</ul>
		</article>
	);
}
