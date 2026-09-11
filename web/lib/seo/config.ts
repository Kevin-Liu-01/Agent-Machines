import { HARNESS_SUMMARY, HARNESS_TOOLS_ANSWER, PRODUCT } from "@/lib/platform/harness";

/**
 * Single source of truth for site-level SEO/GEO/AEO data. Used by
 * `app/layout.tsx` (metadata + JSON-LD), `app/sitemap.ts`, `app/robots.ts`,
 * the FAQ section on the landing, and `public/llms.txt`.
 *
 * Every field that points to a URL uses an absolute URL so structured
 * data validators stop complaining and so OpenGraph / Twitter render
 * correctly even when the page is fetched by a crawler that doesn't
 * resolve relative paths.
 */

/** Compact separator for document titles and social metadata. */
export const TITLE_SEPARATOR = " | ";

export const SITE = {
	name: "Agent Machines",
	wordmark: "agent-machines",
	url: "https://www.agent-machines.dev",
	description:
		"Open-source building blocks for agent harnesses. Configure runtimes, tools, memory, and compute; run real agent CLIs in your browser; inspect and extend the source.",
	longDescription:
		`${PRODUCT.summary} Choose Hermes, OpenClaw, Claude Code, or Codex, then choose Daytona, E2B, Sprites.dev, or Vercel Sandbox. Route model paths through Vercel AI Gateway, OpenRouter, native keys, or a compatible endpoint where the runtime supports it. ${HARNESS_SUMMARY}.`,
	tagline: PRODUCT.tagline,
	ogImage: "/opengraph-image?v=5",
	ogImageAlt:
		"Agent Machines: open-source building blocks for agent harnesses",
	aiSummary: PRODUCT.summary,
	twitterHandle: "@kevin_liu_01",
	authorName: "Kevin Liu",
	authorUrl: "https://github.com/Kevin-Liu-01",
	githubRepo: "Kevin-Liu-01/agent-machines",
	githubUrl: "https://github.com/Kevin-Liu-01/agent-machines",
	keywords: [
		"persistent agent",
		"agent machine",
		"agent infrastructure",
		"Hermes agent",
		"OpenClaw agent",
		"Daytona sandboxes",
		"VM agent",
		"OpenAI-compatible chat completions",
		"agent fleet",
		"per-account agent",
		"MCP server",
		"optional Cursor SDK delegation",
		"agent memory",
		"agent sleep wake",
		"stateful agent",
		"sandbox agent",
		"AI agent runtime",
		"agent router",
		"sandbox router",
		"model router",
		"harness agnostic agent",
		"sandbox agnostic agent",
		"agent SDK",
		"persistent worker",
		"digital worker",
		"open source agent harness",
		"long-running agent",
		"modular agent building blocks",
		"agent worker",
		"agent observability",
		"agent loadout",
		"agent cron",
		"agent artifacts",
		"agent logs",
		"agent usage tracking",
		"browser agent console",
		"E2B agent",
		"Sprites.dev agent",
		"Vercel Sandbox agent",
		"Daytona agent",
	],
	capabilities: [
		"Harness-agnostic agent runtime switchboard",
		"Sandbox-agnostic provider switchboard",
		"Model path and gateway profile routing",
		"Persistent worker provisioning",
		"Declarative lifecycle reconciliation and operation journal",
		"Application-level live migration between sandbox providers",
		"Browser terminal and command surface",
		"Loadout registry for skills, MCP servers, CLIs, plugins, and services",
		"Memory bundles and worker presets",
		"Logs, usage, cron, sessions, artifacts, and fleet observability",
		"TypeScript SDK and REST API",
	],
} as const;

export const LEGAL_EFFECTIVE_DATE = "May 8, 2026";

export type SiteConfig = typeof SITE;

/* ------------------------------------------------------------------ */
/* FAQ source -- mirrored on-page AND in JSON-LD per Princeton GEO    */
/* methods (FAQPage schema is one of the highest AI-citability boosts) */
/* ------------------------------------------------------------------ */

export type FaqEntry = {
	question: string;
	answer: string;
};

export const FAQ: ReadonlyArray<FaqEntry> = [
	{
		question: "Can I run multiple agents for different jobs?",
		answer:
			"Yes. Save starting configurations for coding, research, browser tasks, and other workflows. Each preset suggests a runtime, instructions, and selected abilities. Connect credentials and install the tools you need before running it. One dashboard shows your machines, terminals, files, logs, and usage.",
	},
	{
		question: "What is Agent Machines?",
		answer: PRODUCT.summary,
	},
	{
		question: "How is this different from a regular chatbot?",
		answer:
			"A regular chatbot mostly returns messages. Agent Machines gives the agent a machine record, runtime root, terminal, filesystem, logs, usage, cron schedules, sessions, artifacts, and installable tools. State lives with the worker instead of disappearing after one request.",
	},
	{
		question: "Which agents can I run?",
		answer:
			"Claude Code, Codex, Hermes, and OpenClaw have runtime adapters. You can use the actual native CLI in a browser terminal or use managed execution. Native tools, model paths, and session formats vary by runtime; selecting a runtime does not install every integration in the catalog.",
	},
	{
		question: "Which providers can host the machine?",
		answer:
			"Daytona, E2B Sandbox, Sprites.dev, and Vercel Sandbox. Daytona stop/start retains files but restarts processes; E2B supports pause/resume; Sprites manages idle suspension; Vercel resumes from filesystem snapshots. Each provider exposes only the lifecycle and terminal operations it supports. Historical benchmark results do not establish Daytona performance.",
	},
	{
		question: "How is this different from a sandbox like E2B or Daytona?",
		answer:
			"Those supply compute. Agent Machines adds runtime setup, editable instructions and memory, tool configuration, terminals, files, and logs. You can reuse and modify the open-source adapters instead of rebuilding this layer. Provider-specific features such as pause, snapshots, and preview URLs remain available only where supported.",
	},
	{
		question: "How do I get my own machine today?",
		answer:
			"Sign in and add provider and model credentials in Settings. Open Starter setups, preview a preset, and save it. Review its configuration and provision a machine when ready; saving a setup alone does not launch compute. Quick launch on the overview creates a machine directly. Compute and inference use your connected accounts.",
	},
	{
		question: "What tools and skills can I add?",
		answer: HARNESS_TOOLS_ANSWER,
	},
	{
		question: "Is Cursor required?",
		answer:
			"No. Cursor is optional delegation for code edits through cursor-bridge and @cursor/sdk. Without CURSOR_API_KEY, the rest of the machine still runs: chat, files, browser automation, closed-loop tools, skills, cron, memory, dashboard polling, artifacts, and provider lifecycle controls.",
	},
	{
		question: "What is ~/.agent-machines?",
		answer:
			"~/.agent-machines holds Worker configuration, canonical memory, skills, schedules, logs, chats, and artifacts. Native runtimes also keep their own state directories. The ~ prefix means the sandbox user's home: /home/daytona, /home/user, /home/sprite, or /vercel/sandbox. Knowledge updates use ~/.agent-machines/knowledge-source, separate from the Worker's project at ~/agent-machines.",
	},
	{
		question: "What inference providers are supported?",
		answer:
			"Compatibility depends on both runtime and interface. The hosted dashboard uses native Anthropic for Claude Code and native OpenAI for Codex; Hermes and OpenClaw expose supported router or native-compatible paths. The direct mux SDK has a separate upstream map: Claude Code and Codex support native keys, OpenRouter, and Vercel AI Gateway; Hermes uses native Anthropic or OpenAI. An arbitrary endpoint is not guaranteed to work with every runtime.",
	},
	{
		question: "What happens when a machine sleeps?",
		answer:
			"The behavior is provider-specific. Daytona stop/start retains files but restarts processes. E2B supports pause/resume. Sprites manages idle suspension rather than manual sleep. Vercel uses filesystem snapshots with bounded sessions. Moving files between providers does not migrate live process memory or guarantee that a native conversation can resume unchanged.",
	},
	{
		question: "Can I share or customize a setup?",
		answer: "You can fork the MIT-licensed source, reuse direct SDK configuration files, bring your own skills, and export memory documents as Markdown. Full executable setup import/export, a public marketplace, and a copy-into-app component installer are not available yet. The shadcn analogy describes the source-first design principle, not an existing shadcn integration.",
	},
	{
		question: "Where does my data live?",
		answer:
			"Provider credentials and model keys are stored privately for your account. Worker configuration and history also use the hosted data store; workspace files and runtime state live in the selected sandbox user's home, including ~/.agent-machines. The public client receives redacted credential and machine status.",
	},
];
