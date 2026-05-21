/**
 * Demo copy for dynamically provisioned machines (not in demo-config.json).
 */

import type { AgentKind, MachineRef } from "@/lib/user-config/schema";

export type ProvisionNarrative = {
	headline: string;
	starterPrompts: ReadonlyArray<{ label: string; prompt: string }>;
	welcomeChat: string;
};

const BY_AGENT: Record<AgentKind, Omit<ProvisionNarrative, "headline">> = {
	hermes: {
		starterPrompts: [
			{ label: "What is this?", prompt: "Explain what Agent Machines gives me in plain English" },
			{ label: "Security audit", prompt: "Run a security audit on this repo" },
			{ label: "Show the harness", prompt: "List skills, MCP services, and tools on this machine" },
		],
		welcomeChat:
			"Your **persistent agent** is live — not a bare container, the full combined unit: runtime, 155 skills, 17 MCP integrations, browser automation, cron, and observation. No SSH required.",
	},
	openclaw: {
		starterPrompts: [
			{ label: "What is this?", prompt: "Explain Agent Machines vs OpenClaw CLI only" },
			{ label: "Ops health check", prompt: "Run an ops health check on my services" },
			{ label: "Schedule cron", prompt: "Show me how cron works on this machine" },
		],
		welcomeChat:
			"OpenClaw runtime on a **persistent machine** — skills, services, and scheduling survive sleep/wake. This is the control plane the Bay is missing.",
	},
	"claude-code": {
		starterPrompts: [
			{ label: "What is this?", prompt: "Why is this easier than terminal-only Claude Code?" },
			{ label: "Review this PR", prompt: "Review the latest PR for correctness and security" },
			{ label: "Cursor bridge", prompt: "Show recent Cursor agent runs" },
		],
		welcomeChat:
			"Claude Code with a **visual home** — watch tool calls, costs, and sessions without tailing logs. Built for the 95% who are not sysadmins.",
	},
	codex: {
		starterPrompts: [
			{ label: "What is this?", prompt: "Explain the agent+machine primitive in one paragraph" },
			{ label: "Deploy check", prompt: "Check deployment health and summarize in 3 bullets" },
			{ label: "Save as skill", prompt: "Save this workflow as a reusable SKILL.md" },
		],
		welcomeChat:
			"Codex on a persistent agent machine — every complex task can compound into a reusable **SKILL.md**. That is npm for agent intelligence.",
	},
};

export function provisionNarrativeFor(machine: MachineRef): ProvisionNarrative {
	const agent = BY_AGENT[machine.agentKind] ?? BY_AGENT.hermes;
	return {
		headline: `${machine.name} — persistent agent online`,
		...agent,
	};
}
