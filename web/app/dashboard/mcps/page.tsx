import { McpServerCard } from "@/components/dashboard/McpServerCard";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { listMcpServers } from "@/lib/dashboard/mcps";

export const dynamic = "force-dynamic";

export default function McpsPage() {
	const servers = listMcpServers();
	const totalTools = servers.reduce((acc, s) => acc + s.tools.length, 0);

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker={`MCPS -- ${servers.length} SERVERS . ${totalTools} TOOLS`}
				title="Tool servers"
				description="Every tool the agent can call, grouped by MCP server. Cursor-bridge is bundled in this repo (mcp/cursor-bridge). Agent built-ins ship with the runtime. The on-VM source of truth lives in ~/.agent-machines/config.toml."
			/>
			<div className="grid gap-5 px-6 py-6">
				{servers.map((server) => (
					<McpServerCard key={server.name} server={server} />
				))}
			</div>
		</div>
	);
}
