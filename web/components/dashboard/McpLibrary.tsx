"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, Plug2, ExternalLink, Plus } from "@/components/ui/icons";
import { Logo, type Mark } from "@/components/Logo";
import { ServiceIcon, isServiceSlug } from "@/components/ServiceIcon";
import type { McpServerWithBrand } from "@/lib/dashboard/mcps";
import { cn } from "@/lib/cn";
import { LibrarySearch } from "./LibrarySearch";

const MARKS = new Set(["am", "daytona", "nous", "cursor", "openclaw", "anthropic", "openai"]);

export function McpLibrary({ servers }: { servers: McpServerWithBrand[] }) {
	const [query, setQuery] = useState("");
	const matches = useMemo(() => servers.filter(server => [server.name, server.owner, server.source, ...server.tools.map(tool => `${tool.name} ${tool.title} ${tool.description}`)].join(" ").toLowerCase().includes(query.trim().toLowerCase())), [servers, query]);
	return <div className={cn("space-y-5")}>
		<div className={cn("flex flex-wrap items-center justify-between gap-3")}>
			<LibrarySearch value={query} onChange={setQuery} label="Search servers and tools" />
			<Link href="/dashboard/registry?kind=mcp" className={cn("inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--ret-text)] px-4 text-sm font-medium text-[var(--ret-bg)] focus-visible:outline-2 focus-visible:outline-offset-2")}><Plus className={cn("size-4")} aria-hidden="true" />Add MCP server</Link>
		</div>
		<p role="status" className={cn("text-sm text-[var(--ret-text-muted)]")}>{matches.length} of {servers.length} servers · Library entries, not connection checks.</p>
		<div className={cn("overflow-hidden rounded-lg border border-[var(--ret-border)] divide-y divide-[var(--ret-border)]")}>
			{matches.map(server => <details key={server.name} className={cn("group")}>
				<summary className={cn("flex min-h-20 cursor-pointer list-none items-center gap-4 px-5 py-4 hover:bg-[var(--ret-bg-soft)] focus-visible:outline-2 focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden")}>
					<span className={cn("grid size-10 shrink-0 place-items-center rounded-md border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]")}>
						{server.brand && MARKS.has(server.brand) ? <Logo mark={server.brand as Mark} size={22} /> : server.brand && isServiceSlug(server.brand) ? <ServiceIcon slug={server.brand} size={22} /> : <Plug2 className={cn("size-5")} aria-hidden="true" />}
					</span>
					<span className={cn("min-w-0 flex-1")}><span className={cn("block truncate text-base font-semibold")}>{server.name}</span><span className={cn("mt-1 block truncate text-sm text-[var(--ret-text-muted)]")}>{server.owner ?? server.source}</span></span>
					<span className={cn("hidden text-xs text-[var(--ret-text-muted)] sm:block")}>{server.transport}</span>
					<span className={cn("shrink-0 rounded-md bg-[var(--ret-bg-soft)] px-2.5 py-1 text-xs text-[var(--ret-text-dim)]")}>{server.tools.length} listed tools</span>
					<ChevronDown className={cn("size-4 shrink-0 text-[var(--ret-text-muted)] group-open:rotate-180")} aria-hidden="true" />
				</summary>
				<div className={cn("space-y-5 border-t border-[var(--ret-border)] bg-[var(--ret-bg-soft)]/30 p-5")}>
					<div className={cn("flex flex-wrap items-center gap-3 text-sm")}>
						<Link href={`/dashboard/registry?kind=mcp&q=${encodeURIComponent(server.name)}`} className={cn("inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--ret-border)] px-3 font-medium hover:bg-[var(--ret-surface)]")}>Review setup<ExternalLink className={cn("size-3.5")} aria-hidden="true" /></Link>
						{server.link ? <a href={server.link} target="_blank" rel="noreferrer" className={cn("inline-flex min-h-9 items-center gap-2 text-[var(--ret-text-dim)] underline-offset-4 hover:underline")}>Provider documentation<ExternalLink className={cn("size-3.5")} aria-hidden="true" /></a> : null}
					</div>
					<p className={cn("text-sm leading-6 text-[var(--ret-text-muted)]")}>Review the command, credentials, and runtime setup before installing. Listed tools do not prove a live connection.</p>
					{server.tools.length ? <ul className={cn("divide-y divide-[var(--ret-border)]")}>{server.tools.map(tool => <li key={tool.name} className={cn("grid gap-2 py-4 first:pt-0 md:grid-cols-[minmax(160px,1fr)_2fr]")}><div><p className={cn("break-words font-mono text-xs")}>{tool.name}</p><p className={cn("mt-1 text-sm text-[var(--ret-text-muted)]")}>{tool.title}</p></div><p className={cn("text-sm leading-6 text-[var(--ret-text-dim)]")}>{tool.description}</p></li>)}</ul> : <p className={cn("text-sm text-[var(--ret-text-muted)]")}>This custom entry does not include a tool manifest. Inspect its source before installing.</p>}
				</div>
			</details>)}
			{!matches.length ? <div role="status" className={cn("p-10 text-center")}><Plug2 className={cn("mx-auto mb-4 size-7 text-[var(--ret-text-muted)]")} aria-hidden="true" /><h2 className={cn("text-lg font-semibold")}>{query.trim() ? "No matching servers" : "Connect your tools"}</h2><p className={cn("mt-2 text-sm text-[var(--ret-text-muted)]")}>{query.trim() ? "Try another name or clear your search." : "Add a server from the registry, then review its setup."}</p>{query.trim() ? <button type="button" onClick={() => setQuery("")} className="mt-4 min-h-11 rounded-md border border-[var(--ret-border)] px-4 text-sm hover:bg-[var(--ret-surface)] focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">Clear search</button> : <Link href="/dashboard/registry?kind=mcp" className="mt-4 inline-flex min-h-11 items-center rounded-md border border-[var(--ret-border)] px-4 text-sm hover:bg-[var(--ret-surface)] focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">Browse MCP servers</Link>}</div> : null}
		</div>
	</div>;
}
