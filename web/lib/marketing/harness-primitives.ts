import type { Mark } from "@/components/Logo";
import type { PublicIconName } from "@/lib/marketing/public-site";

export type HarnessPrimitive = {
	id: string;
	title: string;
	icon: PublicIconName;
	description: string;
	options: readonly string[];
	marks: readonly Mark[];
	sourcePath: string;
	dashboardHref: string;
	action: string;
	boundary: string;
};

/** Every item links to implementation source and an existing configuration surface. */
export const HARNESS_PRIMITIVES: readonly HarnessPrimitive[] = [
	{
		id: "runtimes", title: "Agent runtimes", icon: "terminal",
		description: "Use the actual agent, with its own CLI, tools, and configuration. Keep a common interface for creating machines and streaming runs.",
		options: ["Claude Code", "Codex", "Hermes", "OpenClaw"],
		marks: ["claudecode", "codex", "nous", "openclaw"],
		sourcePath: "src/mux/harnesses", dashboardHref: "/dashboard/agents", action: "Choose a starting setup",
		boundary: "Runtime adapters normalize execution, not every native feature or conversation format.",
	},
	{
		id: "compute", title: "Sandbox providers", icon: "server",
		description: "Choose where your agent runs. Provider adapters handle provisioning, files, commands, and supported lifecycle operations.",
		options: ["Daytona", "E2B", "Sprites", "Vercel Sandbox"],
		marks: ["daytona", "e2b", "sprites", "vercel"],
		sourcePath: "src/mux/providers", dashboardHref: "/dashboard/settings", action: "Connect a provider",
		boundary: "Bring your own account. Compute is billed by the provider; sleep, snapshots, and ports differ.",
	},
	{
		id: "models", title: "Models & credentials", icon: "route",
		description: "Connect native model keys or supported routing services. Choose a model path that matches your runtime.",
		options: ["Native keys", "OpenRouter", "Vercel AI Gateway"],
		marks: [], sourcePath: "web/lib/agents/runtime-capabilities.ts", dashboardHref: "/dashboard/settings", action: "Configure model access",
		boundary: "Hosted Claude Code uses Anthropic; hosted Codex uses OpenAI. Direct SDK compatibility differs.",
	},
	{
		id: "abilities", title: "Skills & tools", icon: "boxes",
		description: "Bring your own SKILL.md instructions, browse the package catalog, and configure the MCP connections your setup needs.",
		options: ["SKILL.md", "MCP servers", "CLI packages"],
		marks: [], sourcePath: "web/app/api/dashboard/skills/add/route.ts", dashboardHref: "/dashboard/registry", action: "Browse tools & skills",
		boundary: "Catalog entries are not preinstalled or authenticated. Installation and runtime support are separate checks.",
	},
	{
		id: "memory", title: "Instructions & memory", icon: "book",
		description: "Edit the documents that guide your agent. Import existing instructions, export Markdown, and install documents on a selected machine.",
		options: ["Editable documents", "Markdown export", "Explicit install"],
		marks: [], sourcePath: "web/lib/memory", dashboardHref: "/dashboard/memory", action: "Edit memory & instructions",
		boundary: "Document export is not a complete harness backup. It excludes secrets, tool configuration, and full skill bodies.",
	},
	{
		id: "workspace", title: "Remote workspaces", icon: "layers",
		description: "Open the native CLI in your browser. Move between machines, inspect files and logs, or run commands from the SDK.",
		options: ["Live terminal", "Files & logs", "Streaming API"],
		marks: [], sourcePath: "web/components/dashboard/TerminalWorkspace.tsx", dashboardHref: "/dashboard/machines", action: "Open your machines",
		boundary: "A terminal connects to real remote compute. Native PTY or tmux transport depends on the provider.",
	},
];

export function harnessSourceHref(sourcePath: string): string {
	const kind = /\.[a-z]+$/i.test(sourcePath) ? "blob" : "tree";
	return `https://github.com/Kevin-Liu-01/Agent-Machines/${kind}/main/${sourcePath}`;
}
