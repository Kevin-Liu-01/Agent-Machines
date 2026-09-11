"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { Logo, type Mark } from "@/components/Logo";
import { Pause, Play, Route } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/Skeleton";
import type { SubstrateId } from "@/components/three/HeroOrbitScene";
import { cn } from "@/lib/cn";

const HeroOrbit = dynamic(() => import("@/components/three").then((module) => module.HeroOrbit), {
	ssr: false,
	loading: () => <div className="absolute inset-0 flex items-center justify-end pr-8"><div className="relative flex size-[65%] max-w-[340px] items-center justify-center"><Skeleton className="absolute inset-0 rounded-full" width="100%" height="100%" /><Skeleton className="rounded-full" width="68%" height="68%" /><Logo mark="am" size={36} className="absolute opacity-60" /></div></div>,
});

const AGENTS = [
	{ id: "claude-code", label: "Claude Code", mark: "claudecode" },
	{ id: "codex", label: "Codex", mark: "codex" },
	{ id: "hermes", label: "Hermes", mark: "nous" },
	{ id: "openclaw", label: "OpenClaw", mark: "openclaw" },
] as const;
const PROVIDERS: ReadonlyArray<{ id: SubstrateId; label: string; mark: Mark }> = [
	{ id: "daytona", label: "Daytona", mark: "daytona" },
	{ id: "e2b", label: "E2B", mark: "e2b" },
	{ id: "sprites", label: "Sprites", mark: "sprites" },
	{ id: "vercel", label: "Vercel Sandbox", mark: "vercel" },
];

/** The original orbital artwork, now with explicit, keyboard-accessible controls. */
export function HeroMachinery() {
	const root = useRef<HTMLElement>(null);
	const [agentIndex, setAgentIndex] = useState(0);
	const [providerIndex, setProviderIndex] = useState(0);
	const [enabled, setEnabled] = useState(true);
	const [inView, setInView] = useState(false);
	const [visible, setVisible] = useState(false);
	const [reducedMotion, setReducedMotion] = useState(true);
	const animated = enabled && inView && visible && !reducedMotion;
	const agent = AGENTS[agentIndex];
	const provider = PROVIDERS[providerIndex];

	useEffect(() => {
		const element = root.current;
		if (!element) return;
		const media = window.matchMedia("(prefers-reduced-motion: reduce)");
		const updateMotion = () => setReducedMotion(media.matches);
		const updateVisibility = () => setVisible(document.visibilityState !== "hidden");
		updateMotion();
		updateVisibility();
		media.addEventListener("change", updateMotion);
		document.addEventListener("visibilitychange", updateVisibility);
		const observer = typeof IntersectionObserver === "function"
			? new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? false))
			: null;
		observer?.observe(element);
		return () => {
			observer?.disconnect();
			media.removeEventListener("change", updateMotion);
			document.removeEventListener("visibilitychange", updateVisibility);
		};
	}, []);

	useEffect(() => {
		if (!animated) return;
		const timer = window.setInterval(() => {
			setAgentIndex((current) => (current + 1) % AGENTS.length);
			setProviderIndex((current) => (current + 1) % PROVIDERS.length);
		}, 6500);
		return () => window.clearInterval(timer);
	}, [animated]);

	return (
		<figure ref={root} aria-label="Explore the runtime and compute machinery" data-hero-machinery data-motion={animated ? "running" : "paused"} className={cn("relative isolate min-w-0 overflow-hidden")}>
			<div className={cn("pointer-events-none relative h-[310px] overflow-hidden sm:h-[410px] lg:h-[470px]")} aria-hidden="true" inert>
				<div className={cn("absolute inset-y-0 -left-[65%] right-0")}>
					<HeroOrbit className={cn("h-full w-full")} activeAgent={agent.id} activeSubstrate={provider.id} mode="gears" animated={animated} />
				</div>
				<div className={cn("pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--ret-bg),transparent_22%,transparent_92%,var(--ret-bg))]")} />
			</div>
			<figcaption className={cn("relative z-10 space-y-4 px-1 pb-2")}>
				<div className={cn("flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--ret-text-dim)]")}>
					<p className={cn("flex items-center gap-2")}><Route size={16} aria-hidden="true" />{agent.label}<span className={cn("text-[var(--ret-text-muted)]")}>on</span>{provider.label}</p>
					<button type="button" aria-label={enabled ? "Pause hero animation" : "Play hero animation"} onClick={() => setEnabled((current) => !current)} className={cn("inline-flex min-h-11 items-center gap-2 text-xs text-[var(--ret-text-muted)] hover:text-[var(--ret-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)] motion-reduce:hidden")}>
						{enabled ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}{enabled ? "Pause" : "Play"}
					</button>
				</div>
				<div className={cn("flex flex-wrap gap-x-6 gap-y-4 border-t border-[var(--ret-border)]/40 pt-4")}>
					<PreviewChoices label="Runtime" items={AGENTS} active={agent.id} onSelect={(index) => { setEnabled(false); setAgentIndex(index); }} />
					<PreviewChoices label="Compute" items={PROVIDERS} active={provider.id} onSelect={(index) => { setEnabled(false); setProviderIndex(index); }} />
				</div>
				<p className={cn("text-xs leading-5 text-[var(--ret-text-muted)]")}>Interactive illustration. Selecting a logo previews the machinery; it does not launch a machine.</p>
			</figcaption>
		</figure>
	);
}

function PreviewChoices({ label, items, active, onSelect }: {
	label: string;
	items: ReadonlyArray<{ id: string; label: string; mark: Mark }>;
	active: string;
	onSelect: (index: number) => void;
}) {
	return (
		<div role="group" aria-label={`Preview ${label.toLowerCase()}`} className={cn("min-w-0")}>
			<p className={cn("mb-2 text-xs text-[var(--ret-text-muted)]")}>{label}</p>
			<div className={cn("flex gap-1.5")}>
				{items.map((item, index) => <button key={item.id} type="button" title={item.label} aria-label={`Preview ${item.label}`} aria-pressed={item.id === active} onClick={() => onSelect(index)} className={cn("flex size-11 items-center justify-center rounded-lg border border-[var(--ret-border)]/50 bg-[var(--ret-bg-soft)]/40 text-[var(--ret-text-dim)] transition-[border-color,background-color] duration-150 hover:border-[var(--ret-text-muted)] aria-pressed:border-[var(--ret-text-dim)] aria-pressed:bg-[var(--ret-surface)] aria-pressed:text-[var(--ret-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)] motion-reduce:transition-none")}><Logo mark={item.mark} size={22} /></button>)}
			</div>
		</div>
	);
}
