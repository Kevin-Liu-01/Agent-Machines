import Link from "next/link";

import { McpServerCard } from "@/components/dashboard/McpServerCard";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { importedMcps } from "@/lib/dashboard/pool";
import { getUserConfig } from "@/lib/user-config/clerk";

export const dynamic = "force-dynamic";

export default async function McpsPage() {
	const config = await getUserConfig();
	const servers = importedMcps(config);
	const totalTools = servers.reduce((acc, s) => acc + s.tools.length, 0);

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker={`MCPS -- ${servers.length} IN LIBRARY . ${totalTools} TOOLS`}
				title="Tool servers"
				description="The MCP servers loaded on your machines: a curated starter set, plus any you add from the Registry. Each exposes callable tools to your agents. The full catalog lives in the Registry; the on-VM source of truth is ~/.agent-machines/config.yaml."
			/>
			{servers.length === 0 ? (
				<div className="px-6 py-10">
					<div className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-6 py-12 text-center">
						<p className="text-[13px] text-[var(--ret-text-dim)]">No MCP servers yet.</p>
						<p className="mx-auto mt-1 max-w-[48ch] text-[11px] text-[var(--ret-text-muted)]">
							Install MCP servers from the Registry to give your agents callable
							tools for Vercel, Stripe, Figma, Playwright, and more.
						</p>
						<Link
							href="/dashboard/registry"
							className="mt-4 inline-block border border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ret-purple)] transition-colors hover:bg-[var(--ret-purple)]/20"
						>
							Browse the Registry →
						</Link>
					</div>
				</div>
			) : (
				<div className="grid gap-5 px-6 py-6">
					{servers.map((server) => (
						<McpServerCard key={server.name} server={server} />
					))}
				</div>
			)}
		</div>
	);
}
