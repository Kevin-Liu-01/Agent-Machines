"use client";

import { useMemo, useState } from "react";
import {
	Background,
	BackgroundVariant,
	Controls,
	Handle,
	MarkerType,
	MiniMap,
	Panel,
	Position,
	ReactFlow,
	type Edge,
	type Node,
	type NodeProps,
	useNodesState,
} from "reactflow";
import "reactflow/dist/style.css";

import { Logo, type CompositeMark } from "@/components/Logo";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ServiceIcon, type ServiceSlug } from "@/components/ServiceIcon";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ *
 * Layout philosophy                                                   *
 *                                                                     *
 * Wide and short. The same 23 details from before, but laid out so    *
 * almost every edge is a vertical drop in a 4-column lane:            *
 *                                                                     *
 *   y=0    operator                                                   *
 *   y=140  dashboard      |   CLI                                     *
 *   y=280  fleet                                                      *
 *   y=420  Vercel | Dedalus(live) | Fly       <- 3-column             *
 *   y=580  persistent Linux machine                                   *
 *   y=720  Hermes  |  gateway  |  OpenClaw    <- agent runtime row    *
 *   y=860  ~/.agent-machines | ~/.hermes | repo | ~/.openclaw         *
 *   y=1000 built-ins | services | skills | cursor-bridge              *
 *   y=1140 Dedalus AI router                                          *
 *   y=1280 Anthropic | OpenAI | other catalogs                        *
 *                                                                     *
 * Critically, path-row col k sits directly under tool-row col k, and  *
 * agent-row "Hermes" sits over path col 1, "gateway" over path col 2, *
 * "OpenClaw" over path col 3. So almost every runtime edge is a       *
 * straight vertical line; only Hermes -> ~/.agent-machines bends      *
 * sideways, and that's the lone diagonal in the cluster.              *
 * ------------------------------------------------------------------ */

type NodeTone =
	| "operator"
	| "control"
	| "fleet"
	| "provider"
	| "machine"
	| "gateway"
	| "agent"
	| "state"
	| "tools"
	| "service"
	| "delegation"
	| "router"
	| "model";

const NODE_TONE: Record<NodeTone, string> = {
	operator: "border-[var(--ret-border)] bg-[var(--ret-bg)]",
	control: "border-[var(--ret-border-hover)] bg-[var(--ret-surface)]",
	fleet: "border-[var(--ret-border-hover)] bg-[var(--ret-bg-soft)]",
	provider: "border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/5",
	machine:
		"border-[var(--ret-purple)]/65 bg-[var(--ret-purple-glow)] shadow-[0_0_44px_var(--ret-purple-glow)]",
	gateway: "border-[var(--ret-border-hover)] bg-[var(--ret-bg)]",
	agent: "border-[var(--ret-border-hover)] bg-[var(--ret-bg)]",
	state: "border-[var(--ret-border)] bg-[var(--ret-bg-soft)]",
	tools: "border-[var(--ret-green)]/35 bg-[var(--ret-green)]/5",
	service: "border-[var(--ret-border)] bg-[var(--ret-bg-soft)]",
	delegation: "border-[var(--ret-border)] bg-[var(--ret-bg)]",
	router: "border-[var(--ret-border-hover)] bg-[var(--ret-surface)]",
	model: "border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)]",
};

type NodeStatus = "live" | "stub" | "optional";

const STATUS_LABEL: Record<NodeStatus, { label: string; tone: string }> = {
	live: {
		label: "live",
		tone: "border-[var(--ret-green)]/45 bg-[var(--ret-green)]/10 text-[var(--ret-green)]",
	},
	stub: {
		label: "shaped",
		tone: "border-[var(--ret-amber)]/45 bg-[var(--ret-amber)]/10 text-[var(--ret-amber)]",
	},
	optional: {
		label: "optional",
		tone: "border-[var(--ret-border)] bg-[var(--ret-surface)] text-[var(--ret-text-dim)]",
	},
};

type NodeData = {
	eyebrow: string;
	title: string;
	subtitle: string;
	body: string;
	bullets: ReadonlyArray<string>;
	mark?: CompositeMark;
	services?: ReadonlyArray<ServiceSlug>;
	tone: NodeTone;
	size?: "sm" | "md" | "lg";
	status?: NodeStatus;
};

const NODE_SIZE: Record<NonNullable<NodeData["size"]>, string> = {
	sm: "w-[230px]",
	md: "w-[260px]",
	lg: "w-[310px]",
};

function FlowNode({ data, selected }: NodeProps<NodeData>) {
	const status = data.status ? STATUS_LABEL[data.status] : null;
	// Each side gets BOTH a source and a target handle, both invisible
	// (transparent border + bg) so any edge can pick a side via
	// `sourceHandle` / `targetHandle` ids. Defaults still resolve to
	// top-target / bottom-source via the empty-id handles, so existing
	// edges that don't specify a handle keep working unchanged.
	const handle = "absolute h-1.5 w-1.5 border-0 bg-transparent";
	return (
		<div
			className={cn(
				"arch-node border px-3 py-2.5 font-mono text-[11px] backdrop-blur-sm",
				"transition-[border-color,background-color,box-shadow,transform] duration-150",
				"hover:-translate-y-0.5 hover:border-[var(--ret-purple)]/45 hover:bg-[var(--ret-surface)] hover:shadow-[0_8px_22px_rgba(0,0,0,0.18)]",
				NODE_TONE[data.tone],
				NODE_SIZE[data.size ?? "md"],
				selected &&
					"border-[var(--ret-purple)] bg-[var(--ret-purple-glow)] shadow-[0_0_38px_var(--ret-purple-glow)]",
			)}
		>
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<p className="flex items-center gap-2 text-[9px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
						{data.eyebrow}
						{status ? (
							<span
								className={cn(
									"border px-1 py-px text-[8px] tracking-[0.22em]",
									status.tone,
								)}
							>
								{status.label}
							</span>
						) : null}
					</p>
					<div className="mt-1 flex items-center gap-1.5">
						{data.mark ? (
							<span className="text-[var(--ret-text)]">
								<Logo mark={data.mark} size={14} />
							</span>
						) : null}
						<h3 className="truncate text-[13px] font-semibold tracking-tight text-[var(--ret-text)]">
							{data.title}
						</h3>
					</div>
				</div>
				{data.services ? (
					<div className="flex max-w-[88px] flex-wrap justify-end gap-1 text-[var(--ret-text-dim)]">
						{data.services.slice(0, 6).map((slug) => (
							<ServiceIcon key={slug} slug={slug} size={12} tone="mono" />
						))}
					</div>
				) : null}
			</div>
			<p className="mt-1.5 truncate text-[11px] leading-snug text-[var(--ret-text-dim)]">
				{data.subtitle}
			</p>
			{/* Top */}
			<Handle id="t" type="target" position={Position.Top} className={handle} />
			<Handle
				id="t-out"
				type="source"
				position={Position.Top}
				className={handle}
			/>
			{/* Bottom */}
			<Handle
				id="b"
				type="source"
				position={Position.Bottom}
				className={handle}
			/>
			<Handle
				id="b-in"
				type="target"
				position={Position.Bottom}
				className={handle}
			/>
			{/* Left */}
			<Handle
				id="l"
				type="target"
				position={Position.Left}
				className={handle}
			/>
			<Handle
				id="l-out"
				type="source"
				position={Position.Left}
				className={handle}
			/>
			{/* Right */}
			<Handle
				id="r-out"
				type="source"
				position={Position.Right}
				className={handle}
			/>
			<Handle
				id="r"
				type="target"
				position={Position.Right}
				className={handle}
			/>
		</div>
	);
}

const NODE_TYPES = { box: FlowNode };

/* ------------------------------------------------------------------ *
 * Position grid -- one source of truth so it's mechanical to keep     *
 * lanes aligned. The runtime cluster (agents/paths/tools) shares a    *
 * 4-column lane so every Hermes/gateway/OpenClaw -> path -> tool      *
 * edge is a straight vertical drop.                                   *
 * ------------------------------------------------------------------ */

// Runtime cluster: 4 columns at 360px stride, sm node width 230.
const COL = {
	c0: 40, // ~/.agent-machines / built-ins
	c1: 400, // Hermes / ~/.hermes / MCP services
	c2: 760, // gateway / repo checkout / SKILL.md
	c3: 1120, // OpenClaw / ~/.openclaw / cursor-bridge
};

// Single-column hero nodes (operator, fleet, machine, router) sit on
// the gateway axis (col 2 center = 760 + 115 = 875) so machine ->
// gateway -> router is a single vertical line.
const HERO_X = {
	operator: 760, // sm 230 -> center 875
	fleet: 745, // md 260 -> center 875
	machine: 720, // lg 310 -> center 875
	router: 720, // lg 310 -> center 875
};

// 2-col control row, aligned with cluster col 1 / col 3.
const CONTROL_X = {
	web: 385, // md 260 -> center 515 (slightly left of col 1 center 515) ✓
	cli: 1105, // md 260 -> center 1235 (col 3 center) ✓
};

// 3-col provider/model rows, spread WIDER than the 4-col cluster so
// the diagram displays as horizontal in a 16:10 viewport rather than
// portrait. The center column always sits on the gateway axis so the
// live spine stays straight; the flanks deliberately spill outside
// the cluster's left/right edges.
const TRIPLE_X = {
	left: -120, // md 260 -> center 10
	center: 745, // md 260 -> center 875 (gateway axis)
	right: 1610, // md 260 -> center 1740
};

// Vertical row anchors. Each row leaves at least ~20px of clear space
// below the row above so the smoothstep horizontal segments (which
// carry the edge labels) don't visually overlap the nodes they pass
// between. Larger gaps around machine -> agents -> paths because the
// horizontal gateway hops and the Hermes -> ~/.agent-machines diagonal
// are the most label-dense edges in the diagram.
const Y = {
	operator: 0, // sm ~120 tall, bottom 120
	control: 150, // gap 30
	fleet: 290, // gap 20
	providers: 430, // gap 20
	machine: 590, // gap 40
	agents: 770, // gap 40, horizontal hops live here
	paths: 920, // gap 30
	tools: 1060, // gap 20
	router: 1200, // gap 20
	models: 1360, // gap 20
};

const INITIAL_NODES: Node<NodeData>[] = [
	{
		id: "operator",
		type: "box",
		position: { x: HERO_X.operator, y: Y.operator },
		data: {
			eyebrow: "operator",
			title: "you",
			subtitle: "browser, CLI, or API client",
			body: "You talk to one active machine through the dashboard, CLI, or the OpenAI-compatible gateway.",
			bullets: [
				"browser dashboard",
				"npm run chat",
				"POST /v1/chat/completions",
			],
			tone: "operator",
			size: "sm",
		},
	},
	{
		id: "web",
		type: "box",
		position: { x: CONTROL_X.web, y: Y.control },
		data: {
			eyebrow: "control plane",
			title: "Next.js dashboard",
			subtitle: "Clerk-gated console",
			body: "The web app handles auth, setup, machine selection, live polling, chat, artifacts, logs, skills, MCPs, and fleet metadata.",
			bullets: [
				"per-user UserConfig",
				"active machine switcher",
				"chat + artifacts + logs",
			],
			services: ["nextdotjs", "vercel", "clerk"],
			tone: "control",
			size: "md",
		},
	},
	{
		id: "cli",
		type: "box",
		position: { x: CONTROL_X.cli, y: Y.control },
		data: {
			eyebrow: "local ops",
			title: "CLI lifecycle",
			subtitle: "deploy, chat, wake, sleep, reload",
			body: "The root CLI is the reliable bootstrap path: provision/wake a machine, install Hermes or OpenClaw, expose the gateway, reload knowledge.",
			bullets: [
				"npm run deploy",
				"npm run deploy:openclaw",
				"npm run reload",
			],
			tone: "control",
			size: "md",
		},
	},
	{
		id: "fleet",
		type: "box",
		position: { x: HERO_X.fleet, y: Y.fleet },
		data: {
			eyebrow: "fleet state",
			title: "Clerk UserConfig",
			subtitle: "providers, machines, active id",
			body: "Provider keys and gateway bearers live in Clerk private metadata. Public metadata only exposes redacted machine status.",
			bullets: [
				"multiple MachineRef entries",
				"activeMachineId",
				"server-only provider keys",
			],
			services: ["clerk"],
			tone: "fleet",
			size: "md",
		},
	},
	// Row 3 -- providers (3-col spread). Dedalus center matches the
	// gateway axis so fleet -> dedalus -> machine is one straight line.
	{
		id: "provider-vercel",
		type: "box",
		position: { x: TRIPLE_X.left, y: Y.providers },
		data: {
			eyebrow: "provider",
			title: "Vercel Sandbox",
			subtitle: "Firecracker microVM",
			body: "Same MachineProvider contract, accepted by the schema and setup UI; provisioner returns explicit not_supported until wired.",
			bullets: [
				"per-team scoped sandbox",
				"agent-browser-friendly",
				"contract-only today",
			],
			services: ["vercel"],
			tone: "provider",
			size: "md",
			status: "stub",
		},
	},
	{
		id: "provider-dedalus",
		type: "box",
		position: { x: TRIPLE_X.center, y: Y.providers },
		data: {
			eyebrow: "provider",
			title: "Dedalus Machines",
			subtitle: "default microVM provider",
			body: "Provisions, wakes, sleeps, executes commands. Second-billed; ~30s cold boot, <5s warm.",
			bullets: [
				"provision / wake / sleep",
				"state / exec / destroy",
				"second-billed microVM",
			],
			mark: "dedalus",
			tone: "provider",
			size: "md",
			status: "live",
		},
	},
	{
		id: "provider-fly",
		type: "box",
		position: { x: TRIPLE_X.right, y: Y.providers },
		data: {
			eyebrow: "provider",
			title: "Fly Machines",
			subtitle: "regional microVM",
			body: "Region-pinned alternative. Org slug + token captured in setup; provisioner returns explicit not_supported until wired.",
			bullets: [
				"region pinning",
				"per-org isolation",
				"contract-only today",
			],
			tone: "provider",
			size: "md",
			status: "stub",
		},
	},
	{
		id: "machine",
		type: "box",
		position: { x: HERO_X.machine, y: Y.machine },
		data: {
			eyebrow: "active runtime",
			title: "persistent Linux machine",
			subtitle: "/home/machine is the durable volume",
			body: "The product boundary. A resumable microVM with persistent disk: sleep stops compute, the filesystem survives. Everything below this row lives on this machine.",
			bullets: [
				"1 vCPU / 2 GiB / 10 GiB default",
				"sleep / wake by the second",
				"gateway + agents + tools + state on disk",
			],
			tone: "machine",
			size: "lg",
		},
	},
	// Row 5 -- agent runtime row: Hermes | gateway | OpenClaw, ALL at
	// the same y. Hermes column (c1), gateway column (c2), OpenClaw
	// column (c3) so each agent has its own state column directly
	// below it.
	{
		id: "hermes",
		type: "box",
		position: { x: COL.c1, y: Y.agents },
		data: {
			eyebrow: "agent runtime",
			title: "Hermes",
			subtitle: "memory + cron + sessions + MCP",
			body: "Nous Research's self-improving agent. FTS5 sessions, MEMORY.md/USER.md, cron schedule, MCP server registry, gateway log.",
			bullets: [
				"OpenAI-compatible /v1",
				"persistent across reboots",
				"reload knowledge from git",
			],
			mark: "nous",
			tone: "agent",
			size: "sm",
			status: "live",
		},
	},
	{
		id: "gateway",
		type: "box",
		position: { x: COL.c2, y: Y.agents },
		data: {
			eyebrow: "public api",
			title: "agent gateway",
			subtitle: ":8642 . OpenAI-compatible /v1",
			body: "Single port for both agents. Exposed via Dedalus preview URL or a Cloudflare quick tunnel. The browser proxies through Next.js so bearer tokens stay server-side.",
			bullets: [
				"SSE chat streaming",
				"server-side bearer proxy",
				"public preview or tunnel",
			],
			services: ["cloudflare"],
			tone: "gateway",
			size: "sm",
		},
	},
	{
		id: "openclaw",
		type: "box",
		position: { x: COL.c3, y: Y.agents },
		data: {
			eyebrow: "agent runtime",
			title: "OpenClaw",
			subtitle: "Anthropic computer-use loop",
			body: "openclaw/openclaw upstream. Browser, screenshot, click_xy, type_text. Same /v1 surface as Hermes; switch via the navbar.",
			bullets: [
				"OpenAI-compatible /v1",
				"computer use + browser",
				"swap into the same gateway",
			],
			mark: "openclaw",
			tone: "agent",
			size: "sm",
			status: "live",
		},
	},
	// Row 6 -- on-disk paths (4 cols, column-aligned to row 5)
	{
		id: "path-app",
		type: "box",
		position: { x: COL.c0, y: Y.paths },
		data: {
			eyebrow: "on-disk path",
			title: "~/.agent-machines/",
			subtitle: "app data: chats, artifacts",
			body: "Product data lives separately from agent runtime state so Hermes/OpenClaw upgrades never own user files. Hermes writes here for chat persistence.",
			bullets: [
				"chats/*.json",
				"artifacts/<id>/",
				"machine-readable indexes",
			],
			tone: "state",
			size: "sm",
		},
	},
	{
		id: "path-hermes",
		type: "box",
		position: { x: COL.c1, y: Y.paths },
		data: {
			eyebrow: "on-disk path",
			title: "~/.hermes/",
			subtitle: "Hermes runtime, NOT app data",
			body: "Footgun defused: ~/.hermes is the Hermes runtime root. Skills, crons, sessions, gateway logs, model config. Not the app data root.",
			bullets: [
				"skills/ + crons/",
				"sessions.db (FTS5)",
				"gateway log + config",
			],
			mark: "nous",
			tone: "state",
			size: "sm",
		},
	},
	{
		id: "path-repo",
		type: "box",
		position: { x: COL.c2, y: Y.paths },
		data: {
			eyebrow: "on-disk path",
			title: "/home/machine/agent-machines/",
			subtitle: "git checkout for reloads",
			body: "Just the repo checkout used by reload-from-git.sh. Not ~/.hermes and not the agent runtime.",
			bullets: [
				"git fetch origin/main",
				"sync knowledge/ into ~/.hermes",
				"used by Reload Knowledge",
			],
			tone: "state",
			size: "sm",
		},
	},
	{
		id: "path-openclaw",
		type: "box",
		position: { x: COL.c3, y: Y.paths },
		data: {
			eyebrow: "on-disk path",
			title: "~/.openclaw/",
			subtitle: "OpenClaw runtime state",
			body: "Only present when OpenClaw is installed. Gateway log, screenshots, computer-use cache, model config.",
			bullets: [
				"screenshots/",
				"gateway log + config",
				"X server scratch",
			],
			mark: "openclaw",
			tone: "state",
			size: "sm",
		},
	},
	// Row 7 -- tool surfaces (4 cols, column-aligned to row 6)
	{
		id: "loadout-builtins",
		type: "box",
		position: { x: COL.c0, y: Y.tools },
		data: {
			eyebrow: "tool surface",
			title: "23 built-in tools",
			subtitle: "agent calls these directly",
			body: "Terminal, filesystem, browser (Playwright), vision, image generation, code execution, web search, memory, schedule, subagent delegation.",
			bullets: [
				"terminal . fs_read/write",
				"browser_* . vision",
				"execute_code . delegate",
			],
			tone: "tools",
			size: "sm",
		},
	},
	{
		id: "loadout-services",
		type: "box",
		position: { x: COL.c1, y: Y.tools },
		data: {
			eyebrow: "tool surface",
			title: "17 MCP services",
			subtitle: "branded tool integrations",
			body: "Each service mounts as an MCP server with its own tool catalog. The agent picks a service interface (MCP > CLI > skill) per service.",
			bullets: [
				"Vercel . Stripe . Supabase",
				"Linear . GitHub . Slack . Sentry",
				"PostHog . Figma . Shopify ...",
			],
			services: ["vercel", "stripe", "supabase", "linear", "github", "slack"],
			tone: "service",
			size: "sm",
		},
	},
	{
		id: "loadout-skills",
		type: "box",
		position: { x: COL.c2, y: Y.tools },
		data: {
			eyebrow: "behavior packs",
			title: "95 SKILL.md files",
			subtitle: "load on demand by intent",
			body: "Behavior packs that activate when a prompt matches the skill description. Reload from GitHub via the dashboard.",
			bullets: [
				"design + code review",
				"security + perf + content",
				"reload via git pull",
			],
			tone: "tools",
			size: "sm",
		},
	},
	{
		id: "loadout-cursor",
		type: "box",
		position: { x: COL.c3, y: Y.tools },
		data: {
			eyebrow: "delegation",
			title: "cursor-bridge",
			subtitle: "MCP server wrapping @cursor/sdk",
			body: "Optional. When CURSOR_API_KEY is set, the agent can spawn Cursor coding agents for code edits. .cursor/rules injected from skills.",
			bullets: [
				"cursor_agent",
				"cursor_resume",
				".cursor/rules from skills",
			],
			mark: "cursor",
			tone: "delegation",
			size: "sm",
			status: "optional",
		},
	},
	// Row 8 -- inference router
	{
		id: "router",
		type: "box",
		position: { x: HERO_X.router, y: Y.router },
		data: {
			eyebrow: "inference router",
			title: "Dedalus AI router",
			subtitle: "api.dedaluslabs.ai/v1 . 200+ models",
			body: "OpenAI-compatible router that fronts 200+ models. Hermes is configured via model.base_url; swap DEDALUS_CHAT_BASE_URL to target a different OpenAI-compatible endpoint.",
			bullets: [
				"single key, 200+ models",
				"model slug per machine",
				"swap base_url to switch",
			],
			mark: "dedalus",
			tone: "router",
			size: "lg",
		},
	},
	// Row 9 -- model providers (3-col)
	{
		id: "model-anthropic",
		type: "box",
		position: { x: TRIPLE_X.left, y: Y.models },
		data: {
			eyebrow: "model provider",
			title: "Anthropic",
			subtitle: "Claude family",
			body: "Default Hermes model is anthropic/claude-sonnet-4-6. OpenClaw uses Anthropic for the computer-use loop.",
			bullets: ["claude-sonnet-4-6", "computer-use", "tool-use"],
			services: ["anthropic"],
			tone: "model",
			size: "md",
		},
	},
	{
		id: "model-openai",
		type: "box",
		position: { x: TRIPLE_X.center, y: Y.models },
		data: {
			eyebrow: "model provider",
			title: "OpenAI",
			subtitle: "GPT family",
			body: "Routed through the same OpenAI-compatible gateway. Set the model slug on the machine record to switch.",
			bullets: ["gpt-4o family", "structured output", "OpenAI-compatible"],
			services: ["openai"],
			tone: "model",
			size: "md",
		},
	},
	{
		id: "model-others",
		type: "box",
		position: { x: TRIPLE_X.right, y: Y.models },
		data: {
			eyebrow: "model provider",
			title: "Other catalogs",
			subtitle: "Mistral . Together . Groq . xAI . ...",
			body: "Anything the Dedalus router lists. Or point DEDALUS_CHAT_BASE_URL at an alternative gateway.",
			bullets: [
				"200+ slugs via the router",
				"swap base_url to use another gateway",
				"per-machine model choice",
			],
			tone: "model",
			size: "md",
		},
	},
];

const EDGES: Edge[] = [
	// Operator -> control plane
	{ id: "e-op-web", source: "operator", target: "web", label: "browser" },
	{ id: "e-op-cli", source: "operator", target: "cli", label: "terminal" },
	// Control plane -> fleet (both surfaces register machines via fleet)
	{ id: "e-web-fleet", source: "web", target: "fleet", label: "auth + config" },
	{
		id: "e-cli-fleet",
		source: "cli",
		target: "fleet",
		label: "deploy / wake",
	},
	// Fleet -> 3 providers fan-out (center = live)
	{
		id: "e-fleet-vercel",
		source: "fleet",
		target: "provider-vercel",
		label: "alt",
	},
	{
		id: "e-fleet-dedalus",
		source: "fleet",
		target: "provider-dedalus",
		label: "active",
	},
	{
		id: "e-fleet-fly",
		source: "fleet",
		target: "provider-fly",
		label: "alt",
	},
	// Dedalus -> machine (live spine)
	{
		id: "e-dedalus-machine",
		source: "provider-dedalus",
		target: "machine",
		label: "provision / exec",
	},
	// Machine -> gateway (single vertical drop)
	{
		id: "e-machine-gateway",
		source: "machine",
		target: "gateway",
		label: "serve :8642",
	},
	// Gateway -> Hermes / OpenClaw (same row, horizontal hops). Use the
	// LEFT and RIGHT side handles on the gateway so smoothstep draws
	// flat horizontal lines instead of an ugly U-shape going down then
	// back up to a same-y target.
	{
		id: "e-gateway-hermes",
		source: "gateway",
		sourceHandle: "l-out",
		target: "hermes",
		targetHandle: "r",
		label: "turn loop",
	},
	{
		id: "e-gateway-openclaw",
		source: "gateway",
		sourceHandle: "r-out",
		target: "openclaw",
		targetHandle: "l",
		label: "turn loop",
	},
	// Agents -> on-disk paths. Hermes owns its column and writes to the
	// shared app data path (the only diagonal in the cluster).
	{
		id: "e-hermes-app",
		source: "hermes",
		target: "path-app",
		label: "writes",
	},
	{
		id: "e-hermes-runtime",
		source: "hermes",
		target: "path-hermes",
		label: "owns",
	},
	{
		id: "e-gateway-repo",
		source: "gateway",
		target: "path-repo",
		label: "reload sync",
	},
	{
		id: "e-openclaw-runtime",
		source: "openclaw",
		target: "path-openclaw",
		label: "owns",
	},
	// Paths -> tool surfaces (column-aligned vertical drops).
	{
		id: "e-app-builtins",
		source: "path-app",
		target: "loadout-builtins",
		label: "calls",
	},
	{
		id: "e-hermes-services",
		source: "path-hermes",
		target: "loadout-services",
		label: "MCP",
	},
	{
		id: "e-repo-skills",
		source: "path-repo",
		target: "loadout-skills",
		label: "load",
	},
	{
		id: "e-openclaw-cursor",
		source: "path-openclaw",
		target: "loadout-cursor",
		label: "spawn",
	},
	// Tool surfaces -> router (4-fan-in to center)
	{
		id: "e-builtins-router",
		source: "loadout-builtins",
		target: "router",
		label: "tool-backed",
	},
	{
		id: "e-services-router",
		source: "loadout-services",
		target: "router",
		label: "tool-backed",
	},
	{
		id: "e-skills-router",
		source: "loadout-skills",
		target: "router",
		label: "tool-backed",
	},
	{
		id: "e-cursor-router",
		source: "loadout-cursor",
		target: "router",
		label: "model fan-in",
	},
	// Router -> 3 model providers
	{
		id: "e-router-anthropic",
		source: "router",
		target: "model-anthropic",
		label: "claude-*",
	},
	{
		id: "e-router-openai",
		source: "router",
		target: "model-openai",
		label: "gpt-*",
	},
	{
		id: "e-router-others",
		source: "router",
		target: "model-others",
		label: "200+ slugs",
	},
];

export function ArchitectureFlow() {
	const [nodes, , onNodesChange] = useNodesState<NodeData>(INITIAL_NODES);
	// Inspector panel is hidden by default so the diagram reads clean
	// on first paint; clicking any node reveals it. Clicking the empty
	// canvas closes it again.
	const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

	const active =
		activeNodeId !== null
			? nodes.find((node) => node.id === activeNodeId)
			: null;
	const styledEdges = useMemo<Edge[]>(
		() =>
			EDGES.map((edge) => {
				const isActive =
					activeNodeId !== null &&
					(edge.source === activeNodeId || edge.target === activeNodeId);
				const isHero =
					edge.id === "e-dedalus-machine" ||
					edge.id === "e-machine-gateway" ||
					edge.id === "e-gateway-hermes" ||
					edge.id === "e-gateway-openclaw";
				return {
					...edge,
					type: "smoothstep",
					animated: isActive || isHero,
					style: {
						stroke: isActive
							? "var(--ret-purple)"
							: "var(--ret-border-strong)",
						strokeWidth: isActive ? 2 : 1.25,
						opacity: activeNodeId && !isActive ? 0.5 : 1,
					},
					markerEnd: {
						type: MarkerType.ArrowClosed,
						color: isActive
							? "var(--ret-purple)"
							: "var(--ret-border-strong)",
					},
					labelStyle: {
						fontFamily: "var(--font-mono)",
						fontSize: 10,
						fill: isActive
							? "var(--ret-text)"
							: "var(--ret-text-muted)",
					},
					labelBgStyle: {
						fill: "var(--ret-bg)",
						fillOpacity: 0.95,
					},
					labelBgPadding: [5, 2] as [number, number],
					labelBgBorderRadius: 0,
				};
			}),
		[activeNodeId],
	);

	return (
		<>
			<div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
				<div>
					<ReticleLabel>ARCHITECTURE</ReticleLabel>
					<h2 className="ret-display mt-2 text-xl md:text-2xl">
						The machine is the product boundary.
					</h2>
					<p className="mt-3 max-w-[78ch] text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
						{nodes.length} nodes, ten rows. The persistent Linux machine
						in the middle is the product boundary -- everything above
						provisions and routes to it, everything below runs inside it.
						Click any node to inspect; drag to rearrange.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<ReticleBadge variant="accent">drag nodes</ReticleBadge>
					<ReticleBadge>scroll to zoom</ReticleBadge>
					<ReticleBadge>click to inspect</ReticleBadge>
				</div>
			</div>

			<div className="mt-5 grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] md:grid-cols-4">
				<MachineNote
					label="machine state"
					value="/home/machine persists"
					body="Sleep pauses compute. Disk remains the source of truth."
				/>
				<MachineNote
					label="path split"
					value="four roots, no overlap"
					body=".agent-machines (app), .hermes (runtime), .openclaw, repo checkout."
				/>
				<MachineNote
					label="providers"
					value="dedalus + 2 stubs"
					body="Dedalus is live. Vercel Sandbox + Fly Machines accept credentials."
				/>
				<MachineNote
					label="loadout"
					value="more than cursor"
					body="23 built-ins + 17 service MCPs + 95 skills + optional cursor."
				/>
			</div>

			<div className="architecture-canvas relative mt-4 h-[820px] overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-bg)] md:h-[920px]">
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0"
					style={{
						background:
							"radial-gradient(circle at 50% 36%, var(--ret-purple-glow), transparent 22%), radial-gradient(circle at 50% 80%, rgba(34,197,94,0.08), transparent 20%), radial-gradient(circle at 18% 12%, rgba(245,158,11,0.06), transparent 18%), radial-gradient(circle at 82% 88%, rgba(170,165,230,0.10), transparent 20%)",
					}}
				/>
				<ReactFlow
					nodes={nodes}
					edges={styledEdges}
					nodeTypes={NODE_TYPES}
					onNodesChange={onNodesChange}
					onNodeClick={(_, node) => setActiveNodeId(node.id)}
					onPaneClick={() => setActiveNodeId(null)}
					fitView
					fitViewOptions={{ padding: 0.06 }}
					defaultViewport={{ x: 0, y: 0, zoom: 0.55 }}
					minZoom={0.25}
					maxZoom={1.6}
					snapToGrid
					snapGrid={[20, 20]}
					nodesDraggable
					nodesConnectable={false}
					elementsSelectable
					zoomOnScroll
					panOnScroll
					panOnDrag
					zoomOnPinch
					zoomOnDoubleClick={false}
					proOptions={{ hideAttribution: true }}
				>
					<Background
						variant={BackgroundVariant.Dots}
						gap={24}
						size={1}
						color="var(--ret-grid)"
					/>
					<MiniMap
						className="hidden border border-[var(--ret-border)] bg-[var(--ret-bg)] md:block"
						position="top-right"
						nodeColor={(node) =>
							node.id === activeNodeId
								? "var(--ret-purple)"
								: "var(--ret-border-strong)"
						}
						maskColor="rgba(0,0,0,0.08)"
						pannable
						zoomable
					/>
					<Controls
						position="bottom-right"
						showInteractive={false}
						className="border border-[var(--ret-border)] bg-[var(--ret-bg)]/95"
					/>
					{active ? (
						<Panel position="top-left" className="max-w-[300px]">
							<div className="border border-[var(--ret-border)] bg-[var(--ret-bg)]/95 p-3 font-mono text-[11px] shadow-[0_18px_44px_rgba(0,0,0,0.22)] backdrop-blur">
								<div className="flex items-start justify-between gap-2">
									<p className="text-[9px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
										selected
									</p>
									<button
										type="button"
										onClick={() => setActiveNodeId(null)}
										className="font-mono text-[10px] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]"
										aria-label="Close inspector"
									>
										[x]
									</button>
								</div>
								<div className="mt-1 flex items-center gap-1.5 text-[var(--ret-text)]">
									{active.data.mark ? (
										<Logo mark={active.data.mark} size={14} />
									) : null}
									<strong className="text-[13px]">{active.data.title}</strong>
								</div>
								<p className="mt-2 leading-relaxed text-[var(--ret-text-dim)]">
									{active.data.body}
								</p>
								<ul className="mt-2 grid gap-1">
									{active.data.bullets.map((bullet) => (
										<li
											key={bullet}
											className="flex items-baseline gap-1.5 text-[var(--ret-text-dim)]"
										>
											<span className="text-[var(--ret-purple)]">{"->"}</span>
											<span>{bullet}</span>
										</li>
									))}
								</ul>
							</div>
						</Panel>
					) : null}
				</ReactFlow>
			</div>
		</>
	);
}

function MachineNote({
	label,
	value,
	body,
}: {
	label: string;
	value: string;
	body: string;
}) {
	return (
		<div className="bg-[var(--ret-bg)] p-4">
			<p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
				{label}
			</p>
			<p className="mt-1 font-mono text-[13px] text-[var(--ret-text)]">
				{value}
			</p>
			<p className="mt-1 text-[12px] leading-relaxed text-[var(--ret-text-dim)]">
				{body}
			</p>
		</div>
	);
}
