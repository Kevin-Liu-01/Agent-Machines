"use client";

import {
	Boxes,
	Brain,
	Clock,
	Globe,
	HardDrive,
	History,
	KeyRound,
	type LucideIcon,
	Network,
	Plug,
	Rocket,
	Terminal,
	Zap,
} from "lucide-react";
import dynamic from "next/dynamic";
import { type SVGProps, useEffect, useRef, useState } from "react";

import { SignedIn, SignedOut } from "@/components/AuthSwitch";
import { type HeroAgent } from "@/components/HeroAgentPortrait";
import { Logo, type CompositeMark } from "@/components/Logo";
import { ServiceIcon, SERVICE_LABEL, type ServiceSlug } from "@/components/ServiceIcon";
import { CircuitArt } from "@/components/reticle/CircuitArt";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ProviderRouteBanner } from "@/components/ProviderRouteBanner";
import type { SubstrateId } from "@/components/three/HeroOrbitScene";
import { cn } from "@/lib/cn";

/* ── 3D scene (lazy) ── */

const HeroOrbitScene = dynamic(
	() => import("@/components/three").then((m) => m.HeroOrbit),
	{ ssr: false, loading: () => null },
);

/* ── Agent metadata ── */

const AGENT_CAPABILITIES: Record<HeroAgent, string[]> = {
	hermes: ["memory", "cron", "sessions", "MCP-native"],
	openclaw: ["computer use", "browser", "shell", "vision"],
	"claude-code": ["agentic coding", "file edit", "shell", "SDK"],
	codex: ["agentic coding", "sandbox", "exec mode"],
};

const AGENT_HUE: Record<HeroAgent, string> = {
	hermes: "#7c8cf8",
	openclaw: "#e5443b",
	"claude-code": "#d4a574",
	codex: "#4ae0a0",
};

const AGENT_LABEL: Record<HeroAgent, string> = {
	hermes: "Hermes",
	openclaw: "OpenClaw",
	"claude-code": "Claude Code",
	codex: "Codex CLI",
};

/* ── Animated heading word (typewriter delete + retype with per-char animation) ── */

type TypePhase = "idle" | "deleting" | "pause" | "typing";

function AnimatedWord({ word, hue }: { word: string; hue: string }) {
	const [displayed, setDisplayed] = useState(word);
	const [charCount, setCharCount] = useState(word.length);
	const [phase, setPhase] = useState<TypePhase>("idle");
	const [charTimestamps, setCharTimestamps] = useState<number[]>(
		() => Array.from({ length: word.length }, () => 0),
	);
	const gen = useRef(0);
	const timer = useRef<ReturnType<typeof setTimeout>>(null);
	const phaseRef = useRef<TypePhase>("idle");
	const charCountRef = useRef(word.length);

	useEffect(() => {
		if (timer.current) clearTimeout(timer.current);
		gen.current += 1;
		const myGen = gen.current;

		if (word === displayed && phaseRef.current === "idle") return;

		phaseRef.current = "deleting";
		setPhase("deleting");

		function stale() {
			return myGen !== gen.current;
		}

		function scheduleNext(ms: number) {
			if (timer.current) clearTimeout(timer.current);
			timer.current = setTimeout(tick, ms);
		}

		scheduleNext(60);

		function tick() {
			if (stale()) return;

			if (phaseRef.current === "deleting") {
				const c = charCountRef.current;
				if (c <= 0) {
					phaseRef.current = "pause";
					setPhase("pause");
					setDisplayed(word);
					scheduleNext(280);
					return;
				}
				const next = c - 1;
				charCountRef.current = next;
				setCharCount(next);
				scheduleNext(30 + Math.max(0, next - 2) * 6);
			} else if (phaseRef.current === "pause") {
				if (stale()) return;
				phaseRef.current = "typing";
				setPhase("typing");
				setCharTimestamps([]);
				scheduleNext(60);
			} else if (phaseRef.current === "typing") {
				const c = charCountRef.current;
				if (c >= word.length) {
					phaseRef.current = "idle";
					setPhase("idle");
					return;
				}
				const next = c + 1;
				charCountRef.current = next;
				setCharCount(next);
				setCharTimestamps((ts) => [...ts, performance.now()]);
				const progress = c / Math.max(word.length - 1, 1);
				const base = 70;
				const ease = progress < 0.2
					? base + (1 - progress / 0.2) * 60
					: progress > 0.85
						? base + ((progress - 0.85) / 0.15) * 40
						: base;
				scheduleNext(ease + Math.random() * 35);
			}
		}

		return () => {
			if (timer.current) clearTimeout(timer.current);
		};
	}, [word, displayed]);

	useEffect(() => {
		function onVisibilityChange() {
			if (document.visibilityState !== "visible") return;
			if (phaseRef.current === "idle" || phaseRef.current === "pause") return;
			if (timer.current) clearTimeout(timer.current);
			const myGen = gen.current;
			timer.current = setTimeout(() => {
				if (myGen !== gen.current) return;
				if (phaseRef.current === "deleting") {
					const next = Math.max(charCountRef.current - 1, 0);
					charCountRef.current = next;
					setCharCount(next);
				} else if (phaseRef.current === "typing") {
					const next = Math.min(charCountRef.current + 1, displayed.length);
					charCountRef.current = next;
					setCharCount(next);
				}
			}, 50);
		}
		document.addEventListener("visibilitychange", onVisibilityChange);
		return () => document.removeEventListener("visibilitychange", onVisibilityChange);
	}, [displayed]);

	const now = typeof performance !== "undefined" ? performance.now() : 0;

	return (
		<span className="inline" style={{ color: hue }}>
			{displayed.slice(0, charCount).split("").map((ch, i) => {
				const ts = charTimestamps[i];
				const age = ts ? now - ts : 1000;
				const entering = phase === "typing" && age < 200;
				return (
					<span
						key={`${displayed}-${i}`}
						style={{
							display: "inline-block",
							transition: "transform 0.25s cubic-bezier(0.16,1,0.3,1), opacity 0.2s ease-out",
							transform: entering ? "translateY(0.06em)" : "translateY(0)",
							opacity: entering ? 0.6 : 1,
							whiteSpace: ch === " " ? "pre" : undefined,
						}}
					>
						{ch}
					</span>
				);
			})}
			<span
				className="inline-block w-[0.05em] align-baseline"
				style={{
					height: "0.85em",
					background: hue,
					marginLeft: "1px",
					opacity: phase === "idle" ? 0 : 1,
					animation: phase === "pause" ? "ret-caret 1s steps(1) infinite" : "none",
				}}
			/>
		</span>
	);
}

/* ── Data ── */

const RAIL_AGENTS: ReadonlyArray<{
	mark: CompositeMark;
	label: string;
	id: HeroAgent | null;
	word: string;
}> = [
	{ mark: "nous", label: "Hermes", id: "hermes", word: "Persistent" },
	{ mark: "openclaw", label: "OpenClaw", id: "openclaw", word: "Autonomous" },
	{ mark: "anthropic", label: "Claude", id: "claude-code", word: "Agentic" },
	{ mark: "openai", label: "Codex", id: "codex", word: "Sandboxed" },
	{ mark: "cursor", label: "Cursor", id: null, word: "Routed" },
];

const ALL_WORDS = RAIL_AGENTS.map((a) => a.word);

/* The tool universe, grouped by job — agents + substrates fold in as the
 * first two groups so the whole stack reads as one symmetric panel. */
type GroupItem =
	| { kind: "service"; slug: ServiceSlug }
	| { kind: "logo"; mark: CompositeMark };

const svc = (slug: ServiceSlug): GroupItem => ({ kind: "service", slug });

const dedalus: GroupItem = { kind: "logo", mark: "dedalus" };

/**
 * Substrate lanes — selectable tiles that drive the center 3D model in the
 * hero orbit scene. Hues are hex so the tile's active border + tint and the
 * scene's wireframe color stay in sync.
 */
const SUBSTRATES: ReadonlyArray<{
	id: SubstrateId;
	item: GroupItem;
	label: string;
	hue: string;
}> = [
	{ id: "e2b", item: svc("e2b"), label: "E2B", hue: "#ff8800" },
	{ id: "sprites", item: svc("sprites"), label: "Sprites", hue: "#22c55e" },
	{ id: "dedalus", item: dedalus, label: "Dedalus", hue: "#aaa5e6" },
	{ id: "vercel", item: svc("vercel"), label: "Vercel", hue: "#ededed" },
];

/**
 * The registry wall, grouped by the job each cluster does. Every group renders
 * as a row of brand marks with a flat "[" bracket + mono verb beneath it (see
 * `ToolGroupBracket`), so the colorful logo wall doubles as a legend of what
 * the platform reaches: Route · Automate · Code · Data · Observe · Browse ·
 * Render · Sell.
 */
type ToolGroup = {
	id: string;
	/** Terse verb shown under the cluster's bracket. */
	label: string;
	/** Accent for the bracket + label + hover border. Walks a violet→rose
	 *  spectrum across the row so the wall scans as a color-coded legend. */
	hue: string;
	items: GroupItem[];
};

const REGISTRY_GROUPS: ToolGroup[] = [
	// Routers — one key, any upstream.
	{ id: "route", label: "Route", hue: "#a78bfa", items: [svc("openrouter"), svc("vercel"), dedalus, svc("openai"), svc("anthropic")] },
	{ id: "automate", label: "Automate", hue: "#60a5fa", items: [svc("github"), svc("slack"), svc("linear"), svc("cloudflare")] },
	{ id: "code", label: "Code", hue: "#22d3ee", items: [svc("typescript"), svc("nextdotjs"), svc("react"), svc("tailwindcss")] },
	{ id: "data", label: "Data", hue: "#34d399", items: [svc("supabase"), svc("neon"), svc("upstash"), svc("turso"), svc("firebase"), svc("clickhouse")] },
	{ id: "observe", label: "Observe", hue: "#fbbf24", items: [svc("sentry"), svc("datadog"), svc("posthog"), svc("grafana")] },
	{ id: "browse", label: "Browse", hue: "#fb923c", items: [svc("googlechrome"), svc("playwright"), svc("brave"), svc("exa")] },
	{ id: "render", label: "Render", hue: "#f472b6", items: [svc("figma"), svc("gsap"), svc("framer"), svc("threedotjs"), svc("playcanvas")] },
	{ id: "sell", label: "Sell", hue: "#fb7185", items: [svc("stripe"), svc("shopify")] },
];

/** Capability features, illustrated with a glyph + terse value (no prose). */
type Feat = {
	Icon: LucideIcon;
	label: string;
	value: string;
	/** Brand marks fanned out on the right edge of the cell (decorative). */
	logos: ServiceSlug[];
};

const AGENT_FEATURES: Feat[] = [
	{ Icon: Network, label: "Any router", value: "200+ models", logos: ["openrouter", "anthropic", "openai"] },
	{ Icon: Boxes, label: "Live registry", value: "1,400+ tools", logos: ["figma", "slack", "react"] },
	{ Icon: Terminal, label: "Browser terminal", value: "live PTY", logos: ["googlechrome", "playwright", "brave"] },
	{ Icon: Plug, label: "Tools & MCPs", value: "auto-wired", logos: ["linear", "slack", "github"] },
	{ Icon: Clock, label: "Crons", value: "scheduled", logos: ["cloudflare", "upstash", "datadog"] },
	{ Icon: Rocket, label: "One-click deploy", value: "no setup", logos: ["vercel", "cloudflare", "firebase"] },
];

const SUBSTRATE_FEATURES: Feat[] = [
	{ Icon: Brain, label: "Owned memory", value: "portable", logos: ["supabase", "neon", "upstash"] },
	{ Icon: HardDrive, label: "Persistent state", value: "survives sleep", logos: ["e2b", "sprites", "vercel"] },
	{ Icon: KeyRound, label: "One account", value: "one key", logos: ["clerk", "stripe", "supabase"] },
	{ Icon: Zap, label: "Instant boot", value: "cold-start fast", logos: ["sprites", "e2b", "cloudflare"] },
	{ Icon: History, label: "Snapshots", value: "resume anytime", logos: ["turso", "e2b", "vercel"] },
	{ Icon: Globe, label: "Run anywhere", value: "any region", logos: ["cloudflare", "amazonwebservices", "vercel"] },
];

function GroupIcon({ item, size = 14 }: { item: GroupItem; size?: number }) {
	// Omit `tone` so monochrome marks (vercel, openrouter) auto-resolve to
	// `currentColor` and stay visible in both themes, while colorful brands
	// keep their native palette.
	return item.kind === "service" ? (
		<ServiceIcon slug={item.slug} size={size} />
	) : (
		<Logo mark={item.mark} size={size} />
	);
}

/**
 * A flat "[" laid on its side — a hairline spine with end ticks rising toward
 * the cluster (a ⎵ bracket) plus a terse mono verb. Annotates what a group of
 * brand marks does, like a dimension line on an instrument panel.
 *
 * Carries the group's accent (`--grp`, set on the parent `group/reg`): a faint
 * tint at rest — `color-mix`ed toward the hairline/muted tokens so it stays
 * legible in both themes — that resolves to the full hue when the cluster is
 * hovered.
 */
function ToolGroupBracket({ label }: { label: string }) {
	const line =
		"bg-[color:color-mix(in_oklab,var(--grp)_70%,var(--ret-border))] transition-colors duration-300 group-hover/reg:bg-[color:var(--grp)]";
	return (
		<div className="flex flex-col gap-1">
			<div aria-hidden="true" className="relative h-2 w-full">
				{/* spine */}
				<span className={cn("absolute inset-x-0 bottom-0 h-px", line)} />
				{/* end ticks turning up toward the cluster */}
				<span className={cn("absolute bottom-0 left-0 h-2 w-px", line)} />
				<span className={cn("absolute bottom-0 right-0 h-2 w-px", line)} />
			</div>
			<span className="text-center font-mono text-[8px] uppercase tracking-[0.18em] text-[color:color-mix(in_oklab,var(--grp)_62%,var(--ret-text-dim))] transition-colors duration-300 group-hover/reg:text-[color:var(--grp)]">
				{label}
			</span>
		</div>
	);
}

/**
 * Decorative cluster of colored brand marks fanned out on the right edge of a
 * feature cell. A left-fading mask + a surface gradient wash dissolve the stack
 * into the cell so it never competes with the label; on hover the marks brighten
 * and lift.
 */
function FeatureLogoStack({ slugs }: { slugs: ServiceSlug[] }) {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-y-0 right-0 flex items-center overflow-hidden pr-2.5"
		>
			<span className="absolute inset-y-0 right-0 w-36 bg-[linear-gradient(to_left,var(--ret-surface),transparent)] opacity-70" />
			<div className="relative flex items-center -space-x-2.5 opacity-80 transition-all duration-300 [mask-image:linear-gradient(to_right,transparent,#000_32%)] group-hover/feat:-space-x-1.5 group-hover/feat:opacity-100">
				{slugs.map((slug, i) => (
					<span
						key={slug}
						className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-[var(--ret-border)] bg-[var(--ret-bg)] shadow-[0_1px_5px_rgba(0,0,0,0.25)] transition-transform duration-300 group-hover/feat:-translate-y-[2px]"
						style={{ zIndex: slugs.length - i, transitionDelay: `${i * 45}ms` }}
					>
						{/* No explicit tone: colorful brands keep their palette; dark-fill
						    marks (OpenAI, Anthropic, Vercel…) auto-resolve to mono so they
						    stay visible on the near-black tile. */}
						<ServiceIcon slug={slug} size={14} />
					</span>
				))}
			</div>
		</div>
	);
}

/** A single capability cell: glyph in a tile + label/value, icon-forward. */
function FeatureCell({ Icon, label, value, logos }: Feat) {
	return (
		<div className="group/feat relative flex items-center gap-3 overflow-hidden bg-[var(--ret-bg)] px-3.5 py-3.5 transition-colors hover:bg-[var(--ret-surface)]">
			<span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--ret-border)] bg-[var(--ret-surface)] text-[var(--ret-text)] transition-colors group-hover/feat:border-[var(--ret-text-muted)]">
				<Icon size={18} strokeWidth={1.6} />
			</span>
			<div className="relative z-10 min-w-0 pr-2">
				<div className="truncate font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--ret-text)]">
					{label}
				</div>
				<div className="truncate text-[11px] text-[var(--ret-text-muted)]">{value}</div>
			</div>
			<FeatureLogoStack slugs={logos} />
		</div>
	);
}

/** A brand tile (agent / substrate logo) — colorful, optionally selectable. */
function BrandTile({
	children,
	title,
	active,
	hue,
	onClick,
}: {
	children: React.ReactNode;
	title: string;
	active?: boolean;
	hue?: string;
	onClick?: () => void;
}) {
	const Tag = onClick ? "button" : "div";
	return (
		<Tag
			type={onClick ? "button" : undefined}
			onClick={onClick}
			title={title}
			className={cn(
				"flex h-10 w-10 items-center justify-center rounded-lg border bg-[var(--ret-surface)] transition-all",
				onClick && "cursor-pointer hover:bg-[var(--ret-bg)]",
			)}
			style={{
				borderColor: active ? hue : "var(--ret-border)",
				background: active && hue ? `${hue}14` : undefined,
			}}
		>
			{children}
		</Tag>
	);
}

/* ── Cell primitives ── */

/** Full-bleed hairline spanning the viewport (escapes the content column). */
function BleedLine({ pos }: { pos: "top" | "bottom" }) {
	return (
		<div
			aria-hidden="true"
			className={cn(
				"pointer-events-none absolute left-[-50vw] z-20 h-px w-[200vw] bg-[var(--ret-border)]",
				pos === "top" ? "top-0" : "bottom-0",
			)}
		/>
	);
}

/** Decorative circuit-board texture, theme-adaptive blend. */
function CircuitGrid() {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.1] mix-blend-multiply invert dark:opacity-[0.3] dark:mix-blend-screen dark:invert-0"
			style={{ backgroundImage: "url(/brand/circuit-grid.png)" }}
		/>
	);
}

/**
 * Grid cell with the inset rounded card (the instrument look). Extra grid
 * classes (col-span, borders) go on the outer cell; each child owns its own
 * full-height layout so there are no flex-direction conflicts.
 */
function Cell({
	className,
	circuit,
	bleed,
	children,
}: {
	className?: string;
	circuit?: boolean;
	bleed?: boolean;
	children?: React.ReactNode;
}) {
	return (
		<div className={cn("relative border-[var(--ret-border)]", className)}>
			{bleed ? (
				<>
					<BleedLine pos="top" />
					<BleedLine pos="bottom" />
				</>
			) : null}
			<div className="h-full p-1.5">
				<div className="relative h-full overflow-hidden rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg)]">
					{circuit ? <CircuitGrid /> : null}
					{children}
				</div>
			</div>
		</div>
	);
}

/* ── Main component ── */

export function HeroBlock() {
	const [agent, setAgent] = useState<HeroAgent>("hermes");
	const [wordIndex, setWordIndex] = useState(0);
	const [substrate, setSubstrate] = useState<SubstrateId>("dedalus");
	const activeWord = ALL_WORDS[wordIndex];
	const activeRail = RAIL_AGENTS[wordIndex];
	const isCursor = activeRail.id === null;
	const capabilities = isCursor
		? ["IDE", "rules", "MCP", "agents"]
		: AGENT_CAPABILITIES[agent];
	const hue = isCursor ? "var(--ret-purple)" : AGENT_HUE[agent];
	const orbitAgent = isCursor ? null : agent;
	const activeSubstrate =
		SUBSTRATES.find((s) => s.id === substrate) ?? SUBSTRATES[2];

	const cycleTimer = useRef<ReturnType<typeof setTimeout>>(null);
	const subTimer = useRef<ReturnType<typeof setTimeout>>(null);

	function scheduleCycle() {
		if (cycleTimer.current) clearTimeout(cycleTimer.current);
		cycleTimer.current = setTimeout(() => {
			setWordIndex((cur) => {
				const next = (cur + 1) % RAIL_AGENTS.length;
				const rail = RAIL_AGENTS[next];
				if (rail.id) setAgent(rail.id);
				return next;
			});
			scheduleCycle();
		}, 6000);
	}

	function selectRailIndex(idx: number) {
		setWordIndex(idx);
		const rail = RAIL_AGENTS[idx];
		if (rail.id) setAgent(rail.id);
		scheduleCycle();
	}

	// Substrate auto-cycles on its own cadence — slower than the agent cycle
	// (6s) and out of phase, so the camera move and the center-model morph
	// rarely fire in lockstep and a manual pick lingers long enough to read.
	function scheduleSubstrateCycle() {
		if (subTimer.current) clearTimeout(subTimer.current);
		subTimer.current = setTimeout(() => {
			setSubstrate((cur) => {
				const idx = SUBSTRATES.findIndex((s) => s.id === cur);
				return SUBSTRATES[(idx + 1) % SUBSTRATES.length].id;
			});
			scheduleSubstrateCycle();
		}, 7000);
	}

	function selectSubstrate(id: SubstrateId) {
		setSubstrate(id);
		scheduleSubstrateCycle();
	}

	useEffect(() => {
		scheduleCycle();
		scheduleSubstrateCycle();
		return () => {
			if (cycleTimer.current) clearTimeout(cycleTimer.current);
			if (subTimer.current) clearTimeout(subTimer.current);
		};
	}, []);

	return (
		<div className="relative">
			<ProviderRouteBanner />

			<div className="grid grid-cols-1 md:grid-cols-[4.5rem_repeat(7,1fr)_4.5rem]">
				{/* ═══ Row 1: status ═══ */}
				<Cell className="hidden border-b border-r md:block" circuit />
				<Cell className="col-span-1 border-b border-r md:col-span-5">
					<div className="flex h-full flex-wrap items-center gap-3 px-4 py-3">
						<ReticleLabel>DEVELOPED BY</ReticleLabel>
						<a
							href="https://kevin-liu.tech"
							target="_blank"
							rel="noreferrer"
							className="inline-flex transition-opacity hover:opacity-80"
						>
							<ReticleBadge variant="accent">KEVIN LIU</ReticleBadge>
						</a>
					</div>
				</Cell>
				<Cell className="hidden border-b border-r md:block">
					<div className="flex h-full flex-col items-center justify-center gap-0.5">
						<span className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
							ver
						</span>
						<span className="font-mono text-[11px] text-[var(--ret-text-dim)]">
							0.1.0
						</span>
					</div>
				</Cell>
				<Cell className="hidden border-b border-r md:block">
					<div className="flex h-full items-center justify-center gap-1.5">
						<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ret-green)]" />
						<ReticleBadge variant="success" className="!py-0 !text-[8px]">
							LIVE
						</ReticleBadge>
					</div>
				</Cell>
				<Cell className="hidden border-b md:block" circuit />

				{/* ═══ Row 2: one wide cell — heading + tilted "galaxy" orbit ═══ */}
				<Cell className="hidden border-b border-r md:block" circuit />
				<Cell className="col-span-1 border-b border-r md:col-span-7" bleed>
					{/* The galaxy: same core + logos, on a continuously spinning tilted
					    disc, dissolved into the cell from the right (gradient + hue glow). */}
					<div className="pointer-events-none absolute inset-y-0 right-0 hidden overflow-hidden md:block md:w-[66%]">
						{/* circuit-board texture, fading in from the right edge */}
						<div
							className="absolute inset-0 bg-[length:300px_300px] opacity-[0.14] mix-blend-multiply invert dark:opacity-[0.2] dark:mix-blend-screen dark:invert-0 [-webkit-mask-image:linear-gradient(to_right,transparent,black_60%)] [mask-image:linear-gradient(to_right,transparent,black_60%)]"
							style={{ backgroundImage: "url(/brand/circuit-grid.png)" }}
						/>
						{/* broad ambient hue wash, centered on the gear cluster */}
						<div
							className="absolute inset-0 transition-[background] duration-700"
							style={{
								background: `radial-gradient(80% 94% at 66% 50%, ${hue}14, transparent 78%)`,
							}}
						/>
						{/* tighter glow spanning the left-side combo into the wheels */}
						<div
							className="absolute inset-0 transition-[background] duration-700"
							style={{
								background: `radial-gradient(46% 56% at 58% 50%, ${hue}30, transparent 72%)`,
							}}
						/>
						<HeroOrbitScene
							className="h-full w-full"
							activeAgent={orbitAgent}
							activeSubstrate={activeSubstrate.id}
							mode="gears"
						/>
						{/* dissolve the wheels into the heading on the far left only */}
						<div className="absolute inset-0 bg-[linear-gradient(to_right,var(--ret-bg)_0%,var(--ret-bg)_13%,transparent_45%)]" />
					</div>
					{/* readouts pinned over the galaxy */}
					<span
						className="pointer-events-none absolute right-4 top-3 z-20 hidden font-mono text-[9px] uppercase tracking-[0.22em] transition-colors md:block"
						style={{ color: activeSubstrate.hue }}
					>
						{activeSubstrate.label}
					</span>
					<span className="pointer-events-none absolute bottom-3 right-4 z-20 hidden font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)] md:block">
						{isCursor ? "Cursor" : AGENT_LABEL[agent]}
					</span>

					{/* Heading — left, layered above the galaxy */}
					<div className="relative z-10 flex h-full flex-col justify-center gap-6 px-6 py-12 md:max-w-[58%] md:px-9 md:py-16">
						<h1 className="ret-display text-[clamp(2.5rem,6vw,5.5rem)] leading-[0.96] tracking-tight">
							<span className="-mx-6 flex items-center whitespace-nowrap md:-mx-9">
								<span className="mr-3 h-px w-3 shrink-0 border-t border-dashed border-[var(--ret-border)] md:mr-2 md:w-7" />
								<span>
									<AnimatedWord word={activeWord} hue={hue} /> Agents
								</span>
								<span className="ml-3 h-px flex-1 border-t border-dashed border-[var(--ret-border)] md:ml-4" />
							</span>
							<span className="-mx-6 flex items-center whitespace-nowrap md:-mx-9">
								<span className="mr-3 h-px w-3 shrink-0 border-t border-dashed border-[var(--ret-border)] md:mr-2 md:w-7" />
								<span className="text-[var(--ret-text-muted)]">on any substrate.</span>
								<span className="ml-3 h-px flex-1 border-t border-dashed border-[var(--ret-border)] md:ml-4" />
							</span>
						</h1>
						<p className="max-w-[50ch] text-[15px] leading-relaxed text-[var(--ret-text-dim)]">
							Route runtime and substrate in one account.{" "}
							<strong className="font-medium text-[var(--ret-text)]">
								Deploy persistent agent workers with tools and supervise your
								fleet from one dashboard.
							</strong>
						</p>
						<div className="flex flex-wrap gap-1.5">
							{capabilities.map((cap) => (
								<span
									key={cap}
									className="inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-[var(--ret-text-muted)] transition-colors"
									style={{ borderColor: `${hue}33`, background: `${hue}08` }}
								>
									<span className="h-1 w-1 rounded-full" style={{ background: hue }} />
									{cap}
								</span>
							))}
						</div>
						<div className="flex flex-wrap items-center gap-2.5">
							<SignedIn>
								<ReticleButton as="a" href="/dashboard" variant="primary" size="md">
									<IconArrowRight className="h-3.5 w-3.5" />
									Open dashboard
								</ReticleButton>
							</SignedIn>
							<SignedOut>
								<ReticleButton as="a" href="/sign-in" variant="primary" size="md">
									<IconArrowRight className="h-3.5 w-3.5" />
									Get started
								</ReticleButton>
							</SignedOut>
							<ReticleButton
								as="a"
								href="https://github.com/Kevin-Liu-01/agent-machines"
								target="_blank"
								variant="secondary"
								size="md"
							>
								<ServiceIcon slug="github" size={14} tone="mono" />
								GitHub
							</ReticleButton>
						</div>
					</div>
				</Cell>
				<Cell className="hidden border-b md:block" circuit />

				{/* ═══ Agents — lineup (left) + capability features (right) ═══ */}
				<Cell className="hidden border-b border-r md:block" circuit />
				<Cell className="col-span-1 border-b border-r md:col-span-2">
					<CircuitArt slug="agents" variant="feature" fit="contain" />
					<div className="relative z-10 flex h-full flex-col gap-3 p-4">
						<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
							Agents
						</span>
						<div className="flex flex-1 flex-wrap content-center items-center gap-2">
							{RAIL_AGENTS.map((a, idx) => {
								const active = wordIndex === idx;
								const agentHue = a.id ? AGENT_HUE[a.id] : "var(--ret-purple)";
								return (
									<BrandTile
										key={a.label}
										title={a.label}
										active={active}
										hue={agentHue}
										onClick={() => selectRailIndex(idx)}
									>
										<Logo mark={a.mark} size={20} />
									</BrandTile>
								);
							})}
						</div>
					</div>
				</Cell>
				<Cell className="col-span-1 border-b border-r md:col-span-5">
					<div className="grid h-full grid-cols-2 gap-px bg-[var(--ret-border)] sm:grid-cols-3">
						{AGENT_FEATURES.map((f) => (
							<FeatureCell key={f.label} {...f} />
						))}
					</div>
				</Cell>
				<Cell className="hidden border-b md:block" circuit />

				{/* ═══ Substrates — lineup (left) + capability features (right) ═══ */}
				<Cell className="hidden border-b border-r md:block" circuit />
				<Cell className="col-span-1 border-b border-r md:col-span-2">
					<CircuitArt slug="machines" variant="feature" fit="contain" />
					<div className="relative z-10 flex h-full flex-col gap-3 p-4">
						<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
							Substrates
						</span>
						<div className="flex flex-1 flex-wrap content-center items-center gap-2">
							{SUBSTRATES.map((s) => (
								<BrandTile
									key={s.id}
									title={s.label}
									active={substrate === s.id}
									hue={s.hue}
									onClick={() => selectSubstrate(s.id)}
								>
									<GroupIcon item={s.item} size={20} />
								</BrandTile>
							))}
						</div>
					</div>
				</Cell>
				<Cell className="col-span-1 border-b border-r md:col-span-5">
					<div className="grid h-full grid-cols-2 gap-px bg-[var(--ret-border)] sm:grid-cols-3">
						{SUBSTRATE_FEATURES.map((f) => (
							<FeatureCell key={f.label} {...f} />
						))}
					</div>
				</Cell>
				<Cell className="hidden border-b md:block" circuit />

				{/* ═══ The registry — every router + tool we support, in color ═══ */}
				<Cell className="hidden border-r md:block" circuit />
				<Cell className="col-span-1 border-r md:col-span-7">
					<CircuitArt slug="registry" variant="panel" />
					<div className="relative z-10 flex h-full flex-col gap-3 p-4">
						<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
							<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text)]">
								Use any tool
							</span>
							<span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
								200+ models · 1,400+ skills · MCPs · CLIs
							</span>
						</div>
						<div className="flex flex-wrap items-start gap-x-5 gap-y-4">
							{REGISTRY_GROUPS.map((group) => (
								<div
									key={group.id}
									className="group/reg flex flex-col gap-1.5"
									style={{ "--grp": group.hue } as React.CSSProperties}
								>
									<div className="flex items-center gap-1.5">
										{group.items.map((item, i) => (
											<span
												key={i}
												title={item.kind === "service" ? SERVICE_LABEL[item.slug] : "Dedalus"}
												className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--ret-border)] bg-[var(--ret-surface)] transition-colors group-hover/reg:[border-color:var(--grp)]"
											>
												<GroupIcon item={item} size={15} />
											</span>
										))}
									</div>
									<ToolGroupBracket label={group.label} />
								</div>
							))}
						</div>
					</div>
				</Cell>
				<Cell className="hidden md:block" circuit />
			</div>
		</div>
	);
}

function IconArrowRight(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<path d="M3 8h10M9 4l4 4-4 4" />
		</svg>
	);
}
