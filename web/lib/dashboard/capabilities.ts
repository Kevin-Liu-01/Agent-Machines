export type DashboardCapabilityGroup = "build" | "operate" | "observe" | "automate";

export type DashboardCapability = {
	id: string;
	group: DashboardCapabilityGroup;
	label: string;
	description: string;
	href: string;
	proof: string;
	requiresMachine?: boolean;
	providerAware?: boolean;
};

/**
 * The capabilities the signed-in product is prepared to stand behind.
 *
 * Keep this list operational: every href must resolve to a real dashboard
 * surface and every card must describe behavior the implementation exposes.
 * Provider-specific features are called out instead of being presented as a
 * universal substrate promise.
 */
export const DASHBOARD_CAPABILITIES: ReadonlyArray<DashboardCapability> = [
	{
		id: "agent-templates",
		group: "build",
		label: "Off-the-shelf Workers",
		description: "Create a durable specialist from a tested role, memory, skills, MCPs, and runtime.",
		href: "/dashboard/agents",
		proof: "12 launchable templates",
	},
	{
		id: "provider-routing",
		group: "build",
		label: "Runtime × sandbox routing",
		description: "Pair Hermes, OpenClaw, Claude Code, or Codex with any configured provider lane.",
		href: "/dashboard",
		proof: "4 runtimes · 4 substrates",
	},
	{
		id: "memory",
		group: "build",
		label: "Persistent memory",
		description: "Package persona, instructions, working context, and abilities into reusable memory.",
		href: "/dashboard/memory",
		proof: "editable · installable",
	},
	{
		id: "model-paths",
		group: "build",
		label: "Model paths",
		description: "Use native keys, OpenRouter, Vercel AI Gateway, or an OpenAI-compatible endpoint.",
		href: "/dashboard/settings",
		proof: "BYOK · server-scoped",
	},
	{
		id: "machines",
		group: "operate",
		label: "Machine lifecycle",
		description: "Provision, wake, sleep, select, archive, restore, and destroy through one fleet.",
		href: "/dashboard/machines",
		proof: "provider capability-gated",
		providerAware: true,
	},
	{
		id: "console",
		group: "operate",
		label: "Live console",
		description: "Talk to the active runtime with its machine state and session history attached.",
		href: "/dashboard/chat",
		proof: "machine-scoped",
		requiresMachine: true,
	},
	{
		id: "terminal",
		group: "operate",
		label: "Interactive terminal",
		description: "Open a live PTY or run explicit commands inside the selected worker boundary.",
		href: "/dashboard/terminal",
		proof: "streamed input + output",
		requiresMachine: true,
	},
	{
		id: "migration",
		group: "operate",
		label: "Live migration",
		description: "Move durable worker state to another configured sandbox and choose what happens to the source.",
		href: "/dashboard/machines",
		proof: "journaled · provider-aware",
		requiresMachine: true,
		providerAware: true,
	},
	{
		id: "logs",
		group: "observe",
		label: "Logs",
		description: "Inspect runtime, bootstrap, command, and control-plane events for the active machine.",
		href: "/dashboard/logs",
		proof: "live tail + history",
		requiresMachine: true,
	},
	{
		id: "sessions",
		group: "observe",
		label: "Sessions",
		description: "Review persisted runtime sessions instead of treating every task as a blank chat.",
		href: "/dashboard/sessions",
		proof: "runtime-backed",
		requiresMachine: true,
	},
	{
		id: "usage",
		group: "observe",
		label: "Usage & cost",
		description: "Track fleet CPU, memory, storage, model routing outcomes, and estimated spend.",
		href: "/dashboard/usage",
		proof: "fleet + machine views",
	},
	{
		id: "artifacts",
		group: "observe",
		label: "Artifacts",
		description: "Browse, upload, download, and retain the files produced by a worker.",
		href: "/dashboard/artifacts",
		proof: "machine-scoped files",
		requiresMachine: true,
	},
	{
		id: "cron",
		group: "automate",
		label: "Schedules",
		description: "Create, enable, run, and inspect recurring work against a persistent agent.",
		href: "/dashboard/cron",
		proof: "manual run + cron tick",
	},
	{
		id: "loadout",
		group: "automate",
		label: "Loadouts",
		description: "Inspect and reload the exact skills, tools, MCPs, and packages installed on a machine.",
		href: "/dashboard/loadout",
		proof: "resolved per runtime",
		requiresMachine: true,
	},
	{
		id: "skills",
		group: "automate",
		label: "Skills",
		description: "Browse the live skill registry and add focused operating instructions to agents.",
		href: "/dashboard/skills",
		proof: "registry-derived",
	},
	{
		id: "mcps",
		group: "automate",
		label: "MCP connectors",
		description: "Inspect available MCP servers and the tools each connector adds to a loadout.",
		href: "/dashboard/mcps",
		proof: "catalog-backed",
	},
	{
		id: "benchmarks",
		group: "automate",
		label: "Route benchmarks",
		description: "Run cold-start, command, and readiness checks against configured sandbox lanes.",
		href: "/dashboard/benchmarks",
		proof: "real provider probes",
	},
	{
		id: "registry",
		group: "automate",
		label: "Install registry",
		description: "Search bundled and remote catalogs, then add trusted skills, MCPs, CLIs, tools, and plugins.",
		href: "/dashboard/registry",
		proof: "searchable · installable",
	},
	{
		id: "api-access",
		group: "automate",
		label: "Developer API",
		description: "Create or revoke a user-scoped API key and drive the same Worker model through REST or TypeScript.",
		href: "/dashboard/settings",
		proof: "hashed · user-scoped",
	},
];

export const DASHBOARD_CAPABILITY_GROUPS: ReadonlyArray<{
	id: DashboardCapabilityGroup;
	label: string;
	description: string;
}> = [
	{ id: "build", label: "Compose", description: "Define the Worker that should exist." },
	{ id: "operate", label: "Operate", description: "Run it, control it, and move it." },
	{ id: "observe", label: "Observe", description: "See state, evidence, and cost." },
	{ id: "automate", label: "Extend", description: "Schedule work and attach abilities." },
];
