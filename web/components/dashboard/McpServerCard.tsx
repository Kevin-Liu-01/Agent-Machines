import { Logo, type Mark } from "@/components/Logo";
import { ServiceIcon, isServiceSlug } from "@/components/ServiceIcon";
import type { McpServerWithBrand } from "@/lib/dashboard/mcps";

type Props = {
	server: McpServerWithBrand;
};

const MARK_SET = new Set<string>(["dedalus", "nous", "cursor", "openclaw", "anthropic", "openai"]);

function isMark(value: string): value is Mark {
	return MARK_SET.has(value);
}

/**
 * Per-MCP-server card. Header row shows the partner mark + their name +
 * a transport pill + tool count. Each tool listed below with a name +
 * inline description.
 */
export function McpServerCard({ server }: Props) {
	return (
		<article className="border border-[var(--ret-border)] bg-[var(--ret-bg)]">
			<header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ret-border)] px-5 py-4">
				<div className="flex min-w-0 items-center gap-3">
					{server.brand ? (
						<span className="grid h-9 w-9 shrink-0 place-items-center border border-[var(--ret-border)] bg-[var(--ret-surface)]">
							{isMark(server.brand) ? (
								<Logo mark={server.brand} size={20} />
							) : isServiceSlug(server.brand) ? (
								<ServiceIcon slug={server.brand} size={20} />
							) : null}
						</span>
					) : null}
					<div className="min-w-0">
						<div className="flex flex-wrap items-baseline gap-2">
							<p className="font-mono text-sm text-[var(--ret-purple)]">
								{server.name}
							</p>
							{server.owner ? (
								<p className="font-mono text-[11px] text-[var(--ret-text-muted)]">
									by {server.owner}
								</p>
							) : null}
						</div>
						<p className="mt-0.5 font-mono text-[11px] text-[var(--ret-text-muted)]">
							{server.link ? (
								<a
									href={server.link}
									target="_blank"
									rel="noreferrer"
									className="hover:text-[var(--ret-text-dim)] hover:underline"
								>
									{server.source}
								</a>
							) : (
								server.source
							)}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em]">
					<span className="border border-[var(--ret-border)] bg-[var(--ret-surface)] px-2 py-0.5 text-[var(--ret-text-dim)]">
						{server.transport}
					</span>
					<span className="border border-[var(--ret-border)] bg-[var(--ret-surface)] px-2 py-0.5 text-[var(--ret-text-dim)]">
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
