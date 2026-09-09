export const WORKER_SYSTEM = {
	thesis: "The Worker is durable. Everything underneath is replaceable.",
	promise:
		"Describe the work you need or start from a trusted specialist. Agent Machines assembles the memory, tools, schedule, runtime, and cloud home, then keeps the Worker intact as the machinery changes.",
	layers: [
		{
			id: "route",
			number: "01",
			label: "Route",
			analogy: "OpenRouter for agents + machines",
			description:
				"Choose or automatically route the runtime, model path, and sandbox without binding the Worker to any one vendor.",
		},
		{
			id: "compose",
			number: "02",
			label: "Compose",
			analogy: "Lovable / Bolt / v0 for Workers",
			description:
				"Describe a responsibility and assemble a long-running Worker, or start from a specialist that already knows how to do the job.",
		},
		{
			id: "access",
			number: "03",
			label: "Access",
			analogy: "ChatGPT-simple first use",
			description:
				"Sign in, connect the services it may use, and reach the first useful result before infrastructure becomes part of the conversation.",
		},
	] as const,
	durable: [
		"identity",
		"responsibility",
		"memory",
		"instructions",
		"schedules",
		"files",
		"permissions",
		"abilities",
		"history",
		"evidence",
	] as const,
	replaceable: [
		{ id: "runtime", label: "Agent runtime", detail: "Claude Code · Codex · Hermes · OpenClaw" },
		{ id: "model", label: "Model path", detail: "native · router · gateway · custom" },
		{ id: "sandbox", label: "Sandbox", detail: "Daytona · E2B · Sprites · Vercel" },
		{ id: "abilities", label: "Abilities", detail: "skills · MCPs · CLIs · tools" },
		{ id: "transport", label: "Interaction", detail: "console · PTY · stream · API" },
		{ id: "storage", label: "Persistence", detail: "volume · snapshot · always-on disk" },
		{ id: "scheduler", label: "Execution", detail: "prompt · cron · API · another agent" },
		{ id: "router", label: "Placement", detail: "constraints · outcomes · cost · health" },
	] as const,
	flow: [
		{ number: "01", label: "Describe or choose", detail: "Vibe a Worker into existence or take one off the shelf." },
		{ number: "02", label: "Connect", detail: "Grant only the services and permissions the responsibility needs." },
		{ number: "03", label: "Assign", detail: "Give it a job, schedule, output contract, and approval boundary." },
		{ number: "04", label: "Supervise", detail: "Watch, approve, inspect evidence, and move the Worker when needed." },
	] as const,
	specialists: [
		"Researcher",
		"Browser operator",
		"Career assistant",
		"Household operator",
		"Coding Worker",
		"Small-business ops",
	] as const,
} as const;

export type WorkerSystemLayer = (typeof WORKER_SYSTEM.layers)[number];
