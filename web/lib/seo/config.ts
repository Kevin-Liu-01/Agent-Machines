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
		"Create persistent, long-running Workers from a description or a trusted template. Keep their memory, files, schedules, abilities, and evidence while models, runtimes, and sandboxes change underneath them.",
	longDescription:
		`${PRODUCT.summary} Choose Hermes, OpenClaw, Claude Code, or Codex, then choose Daytona, E2B, Sprites.dev, or Vercel Sandbox. Route model paths through Vercel AI Gateway, OpenRouter, native keys, or a compatible endpoint where the runtime supports it. ${HARNESS_SUMMARY}.`,
	tagline: PRODUCT.tagline,
	ogImage: "/opengraph-image?v=4",
	ogImageAlt:
		"Agent Machines keeps the Worker durable while runtimes, models, tools, and sandboxes remain replaceable",
	aiSummary:
		"Agent Machines is the Worker system for persistent digital labor. A Worker owns its identity, responsibility, memory, instructions, schedules, files, permissions, abilities, history, and evidence; the control plane reconciles replaceable runtimes, model paths, sandbox providers, tools, terminal transports, persistence modes, and placement beneath it.",
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
		"digital labor operating system",
		"long-running agent",
		"agent template marketplace",
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
			"Yes. Provision specialist machines from opinionated presets: Hermes for memory and scheduled work, OpenClaw for browser work, Claude Code or Codex for coding tasks. Each preset bundles runtime, model path, memory, and loadout. One dashboard supervises activity, chat, cron, logs, usage, and artifacts.",
	},
	{
		question: "What is Agent Machines?",
		answer: `${PRODUCT.summary} Start from an off-the-shelf specialist or assemble one from modular primitives. The dashboard lets people watch, approve, inspect, and move the Worker; the SDK and API expose the same lifecycle programmatically.`,
	},
	{
		question: "How is this different from a regular chatbot?",
		answer:
			"A regular chatbot mostly returns messages. Agent Machines gives the agent a machine record, runtime root, terminal, filesystem, logs, usage, cron schedules, sessions, artifacts, and installable tools. State lives with the worker instead of disappearing after one request.",
	},
	{
		question: "Which agents can I run?",
		answer:
			"Hermes, OpenClaw, Claude Code, and Codex are supported. Hermes is the default memory, cron, sessions, and MCP-native runtime. OpenClaw is the computer-use runtime. Claude Code and Codex are task-driven CLIs. All persist state under ~/.agent-machines/.",
	},
	{
		question: "Which providers can host the machine?",
		answer:
			"Daytona, E2B Sandbox, Sprites.dev, and Vercel Sandbox. Daytona stop/start retains files but restarts processes; E2B supports pause/resume; Sprites manages idle suspension; Vercel resumes from filesystem snapshots. Each provider exposes only the lifecycle and terminal operations it supports. Historical benchmark results do not establish Daytona performance.",
	},
	{
		question: "How is this different from a sandbox like E2B or Daytona?",
		answer:
			"Those supply compute. Agent Machines adds the durable Worker above Daytona, E2B, Sprites.dev, or Vercel Sandbox: runtime setup, memory, selected abilities, schedules, logs, usage, artifacts, and the browser console. Provider-specific features such as pause, snapshots, and preview URLs are available only where supported.",
	},
	{
		question: "How do I get my own machine today?",
		answer:
			"Sign in, add provider and model credentials in Settings, open Workers, click a runtime such as Claude Code, then click a configured sandbox such as E2B. That sandbox click creates the Worker, provisions its machine, starts browser-driven bootstrap, and opens the live console.",
	},
	{
		question: "What tools and skills come pre-installed?",
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
			"Models can use any OpenAI-compatible /v1 endpoint. The CLI prefers Vercel AI Gateway, then OpenRouter, then configured fallbacks; override with AGENT_CHAT_BASE_URL or configure model.base_url on the machine. The dashboard stores a model slug per machine.",
	},
	{
		question: "What happens when a machine sleeps?",
		answer:
			"On supported providers, sleep pauses compute while preserving the persistent volume. The next wake resumes from disk: app artifacts, agent runtime state, skills, cron schedules, sessions, and the venv remain available.",
	},
	{
		question: "Where does my data live?",
		answer:
			"Provider credentials and model keys are stored privately for your account. Worker configuration and history also use the hosted data store; workspace files and runtime state live in the selected sandbox user's home, including ~/.agent-machines. The public client receives redacted credential and machine status.",
	},
];
