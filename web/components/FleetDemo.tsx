"use client";

import { AGENTS } from "@/lib/agents";
import { agentMetaForKind, fleetHue, fleetTools } from "@/lib/fleet/agent-styling";
import { FleetStreamCard } from "@/components/fleet/FleetStreamCard";
import type { FleetStreamCardModel } from "@/lib/fleet/view-model";
import type { AgentKind } from "@/lib/user-config/schema";
import { DEFAULT_MODEL } from "@/lib/user-config/schema";

const LANDING_META: Record<
	string,
	{
		shortId: string;
		name: string;
		region: string;
		uptime: string;
		cpu: string;
		mem: string;
		disk: string;
		lines: string[];
	}
> = {
	hermes: {
		shortId: "dm-7f2a",
		name: "hermes-prod",
		region: "us-east-1",
		uptime: "4d 12h",
		cpu: "0.3 vCPU",
		mem: "128 MB",
		disk: "2.1 GB",
		lines: [
			"$ hermes wake",
			"Hermes · hermes-prod · Dedalus",
			"loading memory index...",
			"4,281 memories indexed",
			"cron: sync-feeds in 12m",
			"MCP: 3 servers connected",
			"idle · waiting for prompt.",
		],
	},
	openclaw: {
		shortId: "dm-a91d",
		name: "openclaw-browser",
		region: "us-west-2",
		uptime: "1d 6h",
		cpu: "0.5 vCPU",
		mem: "256 MB",
		disk: "1.4 GB",
		lines: [
			"$ openclaw run",
			"OpenClaw · openclaw-browser · Dedalus",
			"launching browser...",
			"navigating to target",
			"screenshot captured",
			"vision: analyzing page",
			"idle · last activity 4m ago",
		],
	},
	"claude-code": {
		shortId: "dm-e4c8",
		name: "claude-code-ci",
		region: "us-east-1",
		uptime: "2d 19h",
		cpu: "1.0 vCPU",
		mem: "512 MB",
		disk: "4.7 GB",
		lines: [
			"$ claude -p 'fix tests'",
			"Claude Code · claude-code-ci · Dedalus",
			"reading src/api/auth.ts",
			"found 2 failing tests",
			"editing test fixtures...",
			"src/api/auth.test.ts ✓",
			"idle · last activity 12m ago",
		],
	},
	codex: {
		shortId: "dm-3b17",
		name: "codex-sandbox",
		region: "us-east-2",
		uptime: "6h 42m",
		cpu: "0.5 vCPU",
		mem: "256 MB",
		disk: "1.8 GB",
		lines: [
			"$ codex exec 'add cache'",
			"Codex CLI · codex-sandbox · Dedalus",
			"analyzing codebase...",
			"sandbox: initialized",
			"writing redis layer",
			"sandbox: tests pass",
			"idle · last activity 22m ago",
		],
	},
};

function landingCard(agentId: AgentKind, idx: number): FleetStreamCardModel {
	const agent = agentMetaForKind(agentId);
	const meta = LANDING_META[agentId];
	const hue = fleetHue(agentId);

	return {
		id: agentId,
		href: agent.docsUrl,
		name: meta.name,
		agentKind: agentId,
		agentName: agent.name,
		agentBy: agent.by,
		logoMark: agent.logoMark,
		providerKind: "dedalus",
		providerLabel: "Dedalus",
		hue,
		shortId: meta.shortId,
		region: meta.region,
		uptime: meta.uptime,
		cpu: meta.cpu,
		mem: meta.mem,
		disk: meta.disk,
		tools: fleetTools(agentId),
		lines: meta.lines,
		state: "ready",
		active: false,
		model: DEFAULT_MODEL,
		streamActive: true,
		lastActivityAt: null,
		lastActivityLabel: null,
		headline: null,
	};
}

export function FleetDemo() {
	return (
		<div className="px-1 py-1.5">
			<div className="grid w-full grid-cols-2 gap-1.5 md:grid-cols-4">
				{AGENTS.map((agent, idx) => (
					<FleetStreamCard
						key={agent.id}
						card={landingCard(agent.id as AgentKind, idx)}
						delaySec={idx * 0.8}
						live={false}
						external
					/>
				))}
			</div>
		</div>
	);
}
