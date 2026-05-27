import { HARNESS_SUMMARY, HARNESS_TOOLS_ANSWER, PRODUCT } from "@/lib/platform/harness";
import { RUNTIME } from "@/lib/platform/runtime";

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

/** Em dash separator for `<title>` and OG alt text — not `--`. */
export const TITLE_SEPARATOR = " — ";

export const SITE = {
	name: "Agent Machines",
	wordmark: "agent-machines",
	url: "https://www.agent-machines.dev",
	description:
		`${PRODUCT.oneLiner} Hermes, OpenClaw, Claude Code, or Codex on E2B, Sprites.dev, Dedalus Machines, or Vercel Sandbox. ${HARNESS_SUMMARY}.`,
	tagline: PRODUCT.tagline,
	ogImage: "/og.png",
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
		"Dedalus Machines",
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
			"Yes. Provision a fleet of specialist machines from opinionated presets — e.g. Hermes for research/cron, OpenClaw for browser work, Claude Code or Codex for coding. Each preset bundles runtime, skills, MCPs, and system prompts (the same stack vendors ship as single-purpose products like design or research modes). One dashboard supervises every machine: activity, chat, cron, logs, and cost.",
	},
	{
		question: "What is Agent Machines?",
		answer: `${PRODUCT.summary} Think OpenRouter for agents and containers: pick Hermes, OpenClaw, Claude Code, or Codex and pick E2B, Sprites.dev, Dedalus Machines, or Vercel Sandbox in one account. ${PRODUCT.fleet} The dashboard supervises the fleet; MCP/CLI (roadmap) lets other agents orchestrate workers programmatically.`,
	},
	{
		question: "How is this different from a regular chatbot?",
		answer:
			"A regular chatbot usually stores memory in browser state or a vendor-owned memory layer. Agent Machines persists operational state to a real machine filesystem: chat records, artifacts, USER.md, MEMORY.md, agent sessions, cron schedules, skills, and the runtime venv.",
	},
	{
		question: "Which agents can I run?",
		answer:
			"Hermes, OpenClaw, Claude Code, and Codex are supported. Hermes is the default memory, cron, sessions, and MCP-native runtime. OpenClaw is the computer-use runtime. Claude Code and Codex are task-driven CLIs. All persist state under ~/.agent-machines/.",
	},
	{
		question: "Which providers can host the machine?",
		answer:
			"E2B Sandbox, Sprites.dev, Dedalus Machines, and Vercel Sandbox are live provider implementations. Each exposes provision, exec, public URL, and bootstrap through the same MachineProvider abstraction. Dedalus currently benchmarks best on boot latency (~250ms) and sleep/wake in our harness; E2B, Sprites, and Vercel Sandbox are fully supported alternatives.",
	},
	{
		question: "How do I get my own machine today?",
		answer:
			"Sign in with Clerk, add provider credentials in /dashboard/setup, pick the agent, provider, spec, and model, then provision the machine record. The browser flow creates the provider machine and stores it in your fleet; the reliable agent bootstrap path is still the matching root CLI deploy command until browser-driven bootstrap lands.",
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
			"~/.agent-machines is the unified runtime root for Agent Machines. It holds all agent state -- skills, crons, sessions, logs, MEMORY.md, USER.md, config, chats, and artifacts. The repo checkout at /home/machine/agent-machines is used by reload-from-git.sh to sync knowledge from GitHub.",
	},
	{
		question: "What inference providers are supported?",
		answer:
			"Models route through any OpenAI-compatible /v1 endpoint. The CLI defaults to a vendor-agnostic inference URL; override with DEDALUS_CHAT_BASE_URL or configure model.base_url on the machine. The dashboard stores a model slug per machine.",
	},
	{
		question: "What happens when a machine sleeps?",
		answer:
			"On supported providers, sleep pauses compute while preserving the persistent volume. The next wake resumes from disk: app artifacts, agent runtime state, skills, cron schedules, sessions, and the venv remain available.",
	},
	{
		question: "Where does my data live?",
		answer:
			"Provider credentials and gateway bearers live in Clerk private metadata. Machine state lives on the provider machine under /home/machine, with all agent runtime data and app state under ~/.agent-machines. The public client only sees redacted provider and machine status.",
	},
];
