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
		uptime: string;
		lines: string[];
	}
> = {
	hermes: {
		shortId: "dm-7f2a",
		name: "hermes-prod",
		uptime: "4d 12h",
		lines: [
			"$ hermes wake",
			"Hermes · hermes-prod · Daytona",
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
		uptime: "1d 6h",
		lines: [
			"$ openclaw run",
			"OpenClaw · openclaw-browser · Daytona",
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
		uptime: "2d 19h",
		lines: [
			"$ claude -p 'fix tests'",
			"Claude Code · claude-code-ci · Daytona",
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
		uptime: "6h 42m",
		lines: [
			"$ codex exec 'add cache'",
			"Codex CLI · codex-sandbox · Daytona",
			"analyzing codebase...",
			"sandbox: initialized",
			"writing redis layer",
			"sandbox: tests pass",
			"idle · last activity 22m ago",
		],
	},
};

function landingCard(agentId: AgentKind): FleetStreamCardModel {
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
		providerKind: "daytona",
		providerLabel: "Daytona",
		hue,
		shortId: meta.shortId,
		region: "—",
		uptime: meta.uptime,
		cpu: "— vCPU",
		mem: "— MiB",
		disk: "— GiB",
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
			<p className="px-2 pb-2 text-xs leading-relaxed text-[var(--ret-text-muted)]">
				Illustrative fleet — sample activity and uptime, not live Workers or provider benchmarks.
			</p>
			<div className="grid w-full grid-cols-2 gap-1.5 md:grid-cols-4">
				{AGENTS.map((agent, idx) => (
					<FleetStreamCard
						key={agent.id}
						card={landingCard(agent.id as AgentKind)}
						delaySec={idx * 0.8}
						live={false}
						external
					/>
				))}
			</div>
		</div>
	);
}
