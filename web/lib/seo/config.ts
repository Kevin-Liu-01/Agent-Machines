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

export const SITE = {
	name: "Agent Machines",
	wordmark: "agent-machines",
	url: "https://www.agent-machines.dev",
	description:
		"A persistent machine for your agent. One stateful microVM per Clerk account; chat history, files, learned skills, and cron live on /home/machine. Hermes or OpenClaw, Dedalus Machines today, provider abstraction for Vercel Sandbox and Fly, 96 skills, 23 built-ins, and 17 service routes.",
	tagline: "A persistent machine for your agent",
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
		"microVM agent",
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
		question: "What is Agent Machines?",
		answer:
			"Agent Machines is a per-account runtime for persistent agents. Each signed-in user can keep machines with durable Linux filesystems under /home/machine, so chats, working files, artifacts, learned skills, and cron schedules survive sleep and wake cycles.",
	},
	{
		question: "How is this different from a regular chatbot?",
		answer:
			"A regular chatbot usually stores memory in browser state or a vendor-owned memory layer. Agent Machines persists operational state to a real machine filesystem: chat records, artifacts, USER.md, MEMORY.md, agent sessions, cron schedules, skills, and the runtime venv.",
	},
	{
		question: "Which agents can I run?",
		answer:
			"Hermes and OpenClaw are the two agent runtimes represented in the app. Hermes is the default memory, cron, sessions, and MCP-native runtime. OpenClaw is the computer-use runtime with browser, screenshot, click, shell, and file operations. Both sit behind the same machine/gateway concept.",
	},
	{
		question: "Which providers can host the machine?",
		answer:
			"Dedalus Machines is wired end-to-end today. The MachineProvider abstraction, setup UI, and user config schema also include Vercel Sandbox and Fly Machines, but those provisioners currently return explicit not-supported responses until their provider implementations land.",
	},
	{
		question: "How do I get my own machine today?",
		answer:
			"Sign in with Clerk, add provider credentials in /dashboard/setup, pick the agent, provider, spec, and model, then provision the machine record. The browser flow creates the provider machine and stores it in your fleet; the reliable agent bootstrap path is still the matching root CLI deploy command until browser-driven bootstrap lands.",
	},
	{
		question: "What tools and skills come pre-installed?",
		answer:
			"The public loadout tracks 23 built-in tools, 17 service routes, and 96 SKILL.md files. The surface includes terminal, filesystem, browser automation, web search, vision, image generation, code execution, cron, memory, sessions, closed-loop CLIs (agent-browser, Playwright, curl, jq, httpx, sqlite3, ss, dig), Vercel, Stripe, Supabase, Linear, GitHub, Slack, PostHog, Sentry, Clerk, Firebase, Figma, Shopify, ClickHouse, Datadog, AWS, Cloudflare, and model providers.",
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
			"Dedalus is the default OpenAI-compatible inference endpoint. The agent is configured through model.base_url and model.default, so the CLI can point DEDALUS_CHAT_BASE_URL at another compatible /v1 endpoint when needed. The dashboard stores a model slug per machine.",
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
