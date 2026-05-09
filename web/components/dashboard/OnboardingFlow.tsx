"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { BootTranscript } from "@/components/dashboard/BootTranscript";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ToolIcon } from "@/components/ToolIcon";
import { WingBackground } from "@/components/WingBackground";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleHatch } from "@/components/reticle/ReticleHatch";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { cn } from "@/lib/cn";
import {
	BUILTIN_TOOLS,
	CATEGORY_LABEL,
	type AgentSupport,
	type BuiltinTool,
	type ToolCategory,
} from "@/lib/dashboard/loadout";
import type { McpServerWithBrand } from "@/lib/dashboard/mcps";
import type { SkillSummary } from "@/lib/dashboard/types";
import {
	AGENT_LABEL,
	type AgentKind,
	type PublicUserConfig,
	type MachineSpec,
} from "@/lib/user-config/schema";

type Defaults = {
	machineSpec: MachineSpec;
	model: string;
	hasOwnerDedalusKey: boolean;
};

type Props = {
	initialConfig: PublicUserConfig;
	defaults: Defaults;
	skills: SkillSummary[];
	mcps: McpServerWithBrand[];
	builtins: BuiltinTool[];
};

type Step = "agent" | "skills" | "tools" | "key" | "boot";

const STEPS: ReadonlyArray<{ id: Step; label: string; hint: string }> = [
	{ id: "agent", label: "Agent", hint: "personality" },
	{ id: "skills", label: "Skills", hint: "auto-loaded knowledge" },
	{ id: "tools", label: "Tools", hint: "callable surface" },
	{ id: "key", label: "Key", hint: "Dedalus token" },
	{ id: "boot", label: "Boot", hint: "spin up rig" },
];

const AGENT_DESC: Record<
	AgentKind,
	{
		name: string;
		mark: "nous" | "openclaw";
		tagline: string;
		bullets: string[];
		links: ReadonlyArray<{ label: string; href: string }>;
	}
> = {
	hermes: {
		name: "Hermes",
		mark: "nous",
		tagline: "Self-improving. Memory + cron. MCP-native.",
		bullets: [
			"USER.md + MEMORY.md persist on /home/machine",
			"FTS5 sessions DB indexes every chat for instant recall",
			"Cron schedules survive sleeps; wake the VM on tick",
		],
		links: [
			{ label: "github", href: "https://github.com/NousResearch/hermes-agent" },
			{ label: "docs", href: "https://hermes-agent.nousresearch.com/docs/" },
		],
	},
	openclaw: {
		name: "OpenClaw",
		mark: "openclaw",
		tagline: "Computer use. Browser + shell + vision.",
		bullets: [
			"Anthropic computer-use loop on a real X server",
			"Browser + screenshot + click-by-coordinates",
			"State + screenshots cached on the machine disk",
		],
		links: [
			{ label: "github", href: "https://github.com/openclaw/openclaw" },
			{ label: "ddls cookbook", href: "https://github.com/dedalus-labs/openclaw-ddls" },
		],
	},
};

const POLL_MS = 3000;

export function OnboardingFlow({
	initialConfig,
	defaults,
	skills,
	mcps,
	builtins,
}: Props) {
	const router = useRouter();
	const [step, setStep] = useState<Step>("agent");
	const [agent, setAgent] = useState<AgentKind>(
		initialConfig.draftAgentKind ?? "hermes",
	);
	const [skillSel, setSkillSel] = useState<Set<string>>(
		() => new Set(skills.map((s) => s.slug)),
	);
	const [builtinSel, setBuiltinSel] = useState<Set<string>>(
		() => new Set(builtins.map((t) => t.name)),
	);
	const [mcpSel, setMcpSel] = useState<Set<string>>(
		() => new Set(mcps.map((m) => m.name)),
	);
	const [dedalusKey, setDedalusKey] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Boot state
	const [bootMachineId, setBootMachineId] = useState<string | null>(null);
	const [bootPhase, setBootPhase] = useState<string | null>(null);
	const [bootDone, setBootDone] = useState(false);

	const hasKey = initialConfig.providers.dedalus.configured;
	const ownerKey = defaults.hasOwnerDedalusKey;

	function next() {
		const order = STEPS.map((s) => s.id);
		const i = order.indexOf(step);
		if (i < order.length - 1) setStep(order[i + 1]);
	}
	function back() {
		const order = STEPS.map((s) => s.id);
		const i = order.indexOf(step);
		if (i > 0) setStep(order[i - 1]);
	}

	function toggleSkill(slug: string) {
		setSkillSel((prev) => {
			const next = new Set(prev);
			if (next.has(slug)) next.delete(slug);
			else next.add(slug);
			return next;
		});
	}
	function toggleBuiltin(name: string) {
		setBuiltinSel((prev) => {
			const next = new Set(prev);
			if (next.has(name)) next.delete(name);
			else next.add(name);
			return next;
		});
	}
	function toggleMcp(name: string) {
		setMcpSel((prev) => {
			const next = new Set(prev);
			if (next.has(name)) next.delete(name);
			else next.add(name);
			return next;
		});
	}

	const provision = useCallback(async () => {
		setBusy(true);
		setError(null);
		try {
			// Persist agent + key first.
			const setupBody: Record<string, unknown> = {
				draftAgentKind: agent,
			};
			if (dedalusKey.trim()) {
				setupBody.providerCredentials = {
					dedalus: { apiKey: dedalusKey.trim() },
				};
			}
			const setupResp = await fetch("/api/dashboard/admin/setup", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(setupBody),
			});
			if (!setupResp.ok) {
				const body = (await setupResp.json().catch(() => ({}))) as {
					message?: string;
				};
				throw new Error(body.message ?? `setup failed (HTTP ${setupResp.status})`);
			}

			// Provision machine.
			const provResp = await fetch("/api/dashboard/admin/provision-machine", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					providerKind: "dedalus",
					agentKind: agent,
				}),
			});
			const provBody = (await provResp.json()) as {
				ok?: boolean;
				machineId?: string;
				phase?: string;
				message?: string;
				error?: string;
			};
			if (!provResp.ok || !provBody.machineId) {
				throw new Error(
					provBody.message ??
						provBody.error ??
						`provision failed (HTTP ${provResp.status})`,
				);
			}
			setBootMachineId(provBody.machineId);
			setBootPhase(provBody.phase ?? "accepted");
		} catch (err) {
			setError(err instanceof Error ? err.message : "provision failed");
		} finally {
			setBusy(false);
		}
	}, [agent, dedalusKey]);

	// Poll machine state once we have an id.
	useEffect(() => {
		if (!bootMachineId) return;
		let stopped = false;
		async function tick() {
			try {
				const r = await fetch("/api/dashboard/machine", { cache: "no-store" });
				if (!r.ok) return;
				const body = (await r.json()) as { phase?: string };
				if (stopped) return;
				if (body.phase) setBootPhase(body.phase);
				if (body.phase === "running") {
					setBootDone(true);
					stopped = true;
				}
			} catch {
				// transient -- next tick will retry
			}
		}
		void tick();
		const id = window.setInterval(tick, POLL_MS);
		return () => {
			stopped = true;
			window.clearInterval(id);
		};
	}, [bootMachineId]);

	// Once boot completes, ride into the dashboard.
	useEffect(() => {
		if (!bootDone) return;
		const id = window.setTimeout(() => {
			router.push("/dashboard");
		}, 2000);
		return () => window.clearTimeout(id);
	}, [bootDone, router]);

	const counts = {
		skills: skillSel.size,
		builtins: builtinSel.size,
		mcps: mcpSel.size,
		mcpTools: mcps
			.filter((m) => mcpSel.has(m.name))
			.reduce((acc, m) => acc + m.tools.length, 0),
	};

	function handleStartBoot() {
		setStep("boot");
		void provision();
	}

	const canProvision = hasKey || ownerKey || dedalusKey.trim().length > 0;

	return (
		<main className="relative min-h-[100dvh] overflow-hidden bg-[var(--ret-bg)] text-[var(--ret-text)]">
			{/*
			  Ambient brand backdrop. Light mode = cloud-lines plate,
			  dark mode = nyx-lines plate. The kit-builder reads as a
			  designed surface, never a cold form.
			*/}
			<WingBackground variant="cloud" />
			<header className="relative z-10 border-b border-[var(--ret-border)] bg-[var(--ret-bg)]/85 px-6 py-4 backdrop-blur">
				<div className="mx-auto flex max-w-[var(--ret-content-max)] items-center justify-between gap-4">
					<a href="/" className="group flex items-center gap-2.5">
						<BrandMark size={20} gap="tight" withLabel={false} />
						<span
							className="text-[18px] leading-none tracking-tight text-[var(--ret-text)] transition-colors group-hover:text-[var(--ret-purple)]"
							style={{ fontFamily: "var(--font-display-serif)" }}
						>
							agent-machines
						</span>
					</a>
					<div className="flex items-center gap-3">
						<ThemeToggle />
						<a
							href="/dashboard"
							className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]"
						>
							{"skip ->"}
						</a>
					</div>
				</div>
			</header>

			<div className="relative z-10 mx-auto grid max-w-[var(--ret-content-max)] gap-px bg-[var(--ret-border)] lg:grid-cols-[1.4fr_1fr]">
				<section className="bg-[var(--ret-bg)] p-6">
					<StepRail step={step} />

					{error ? (
						<ReticleFrame className="mt-4 border-[var(--ret-red)]/50 bg-[var(--ret-red)]/5 p-3">
							<p className="font-mono text-[11px] text-[var(--ret-red)]">
								{error}
							</p>
						</ReticleFrame>
					) : null}

					<div className="mt-6">
						{step === "agent" ? (
							<AgentStep value={agent} onPick={(a) => setAgent(a)} onNext={next} />
						) : null}
						{step === "skills" ? (
							<SkillsStep
								skills={skills}
								selected={skillSel}
								onToggle={toggleSkill}
								onSelectAll={() => setSkillSel(new Set(skills.map((s) => s.slug)))}
								onDeselectAll={() => setSkillSel(new Set())}
								onBack={back}
								onNext={next}
							/>
						) : null}
						{step === "tools" ? (
							<ToolsStep
								agent={agent}
								builtins={builtins}
								mcps={mcps}
								builtinSelected={builtinSel}
								mcpSelected={mcpSel}
								onToggleBuiltin={toggleBuiltin}
								onToggleMcp={toggleMcp}
								onBack={back}
								onNext={next}
							/>
						) : null}
						{step === "key" ? (
							<KeyStep
								hasKey={hasKey}
								ownerKey={ownerKey}
								value={dedalusKey}
								onChange={setDedalusKey}
								busy={busy}
								canProvision={canProvision}
								onBack={back}
								onProvision={handleStartBoot}
							/>
						) : null}
						{step === "boot" ? (
							<BootStep
								agent={agent}
								machineId={bootMachineId}
								phase={bootPhase}
								done={bootDone}
								busy={busy}
								onRetry={() => void provision()}
								error={error}
							/>
						) : null}
					</div>
				</section>

				<aside className="relative hidden overflow-hidden bg-[var(--ret-bg-soft)] lg:block">
					<div
						aria-hidden="true"
						className="pointer-events-none absolute -right-16 -top-16 h-[420px] w-[420px] opacity-[0.07] dark:opacity-[0.10]"
					>
						<Image
							src="/brand/wing-mark.png"
							alt=""
							fill
							sizes="420px"
							className="object-contain object-right-top dark:hidden"
						/>
						<Image
							src="/brand/wing-mark-dark.png"
							alt=""
							fill
							sizes="420px"
							className="hidden object-contain object-right-top dark:block"
						/>
					</div>
					<RigPreview
						agent={agent}
						counts={counts}
						skills={skills.filter((s) => skillSel.has(s.slug))}
						builtins={builtins.filter((b) => builtinSel.has(b.name))}
						mcps={mcps.filter((m) => mcpSel.has(m.name))}
						bootPhase={step === "boot" ? bootPhase : null}
						bootDone={bootDone}
					/>
				</aside>
			</div>
		</main>
	);
}

function StepRail({ step }: { step: Step }) {
	const order = STEPS.map((s) => s.id);
	const i = order.indexOf(step);
	return (
		<ol className="grid grid-cols-5 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
			{STEPS.map((s, idx) => {
				const isActive = idx === i;
				const isDone = idx < i;
				return (
					<li
						key={s.id}
						className={cn(
							"flex items-center gap-2 bg-[var(--ret-bg)] px-2.5 py-2",
							isActive
								? "bg-[var(--ret-purple-glow)]"
								: isDone
									? "opacity-90"
									: "opacity-60",
						)}
					>
						<span
							className={cn(
								"flex h-4 w-4 items-center justify-center border font-mono text-[9px] tabular-nums",
								isDone
									? "border-[var(--ret-green)]/40 bg-[var(--ret-green)]/10 text-[var(--ret-green)]"
									: isActive
										? "border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
										: "border-[var(--ret-border)] text-[var(--ret-text-muted)]",
							)}
						>
							{isDone ? "ok" : idx + 1}
						</span>
						<span className="min-w-0">
							<p className="truncate font-mono text-[11px] text-[var(--ret-text)]">
								{s.label}
							</p>
							<p className="truncate font-mono text-[10px] text-[var(--ret-text-muted)]">
								{s.hint}
							</p>
						</span>
					</li>
				);
			})}
		</ol>
	);
}

function AgentStep({
	value,
	onPick,
	onNext,
}: {
	value: AgentKind;
	onPick: (kind: AgentKind) => void;
	onNext: () => void;
}) {
	return (
		<div className="space-y-5">
			<div>
				<ReticleLabel>step 1 . agent</ReticleLabel>
				<h1 className="ret-display mt-1 text-2xl">
					Pick your agent
				</h1>
				<p className="mt-1 max-w-[60ch] text-[13px] text-[var(--ret-text-dim)]">
					Both run on the same machine, persist to the same /home/machine
					filesystem, expose the same OpenAI-compatible API, and read the
					same skills + tools. They differ in personality and native toolset.
					You can swap later from the navbar -- the disk doesn't care.
				</p>
			</div>
			<div className="grid gap-3 md:grid-cols-2">
				{(Object.keys(AGENT_DESC) as AgentKind[]).map((kind) => {
					const meta = AGENT_DESC[kind];
					const selected = value === kind;
					return (
						<div
							key={kind}
							className={cn(
								"flex flex-col border transition-colors",
								selected
									? "border-[var(--ret-purple)] bg-[var(--ret-purple-glow)]"
									: "border-[var(--ret-border)] bg-[var(--ret-bg)] hover:border-[var(--ret-border-hover)]",
							)}
						>
							<button
								type="button"
								onClick={() => onPick(kind)}
								className="group flex flex-col gap-3 p-4 text-left"
							>
								<div className="flex items-center justify-between gap-2">
									<div className="flex items-center gap-2">
										<Logo mark={meta.mark} size={20} />
										<h2 className="font-mono text-[14px] text-[var(--ret-text)]">
											{meta.name}
										</h2>
									</div>
									{selected ? (
										<ReticleBadge variant="accent">selected</ReticleBadge>
									) : null}
								</div>
								<p className="text-[12px] text-[var(--ret-text-dim)]">
									{meta.tagline}
								</p>
								<ul className="space-y-0.5 font-mono text-[10px] text-[var(--ret-text-muted)]">
									{meta.bullets.map((b) => (
										<li key={b} className="flex items-start gap-1.5">
											<span>.</span>
											<span>{b}</span>
										</li>
									))}
								</ul>
							</button>
							{/* Source links sit OUTSIDE the picker button so clicking
							    them opens the link instead of selecting the agent. */}
							<div className="flex flex-wrap gap-1.5 border-t border-[var(--ret-border)] px-4 py-2">
								{meta.links.map((l) => (
									<a
										key={l.href}
										href={l.href}
										target="_blank"
										rel="noreferrer"
										className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)] transition-colors hover:text-[var(--ret-purple)]"
									>
										{l.label} {"->"}
									</a>
								))}
							</div>
						</div>
					);
				})}
			</div>
			<div className="flex justify-end">
				<ReticleButton variant="primary" size="md" onClick={onNext}>
					Continue {"->"}
				</ReticleButton>
			</div>
		</div>
	);
}

function SkillsStep({
	skills,
	selected,
	onToggle,
	onSelectAll,
	onDeselectAll,
	onBack,
	onNext,
}: {
	skills: SkillSummary[];
	selected: Set<string>;
	onToggle: (slug: string) => void;
	onSelectAll: () => void;
	onDeselectAll: () => void;
	onBack: () => void;
	onNext: () => void;
}) {
	const grouped = useMemo(() => {
		const m: Record<string, SkillSummary[]> = {};
		for (const s of skills) (m[s.category] ??= []).push(s);
		return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
	}, [skills]);

	const allSelected = selected.size === skills.length;

	return (
		<div className="space-y-5">
			<div>
				<ReticleLabel>step 2 . skills</ReticleLabel>
				<h1 className="ret-display mt-1 text-2xl">Pick your skills</h1>
				<p className="mt-1 max-w-[60ch] text-[13px] text-[var(--ret-text-dim)]">
					{skills.length} SKILL.md files load on demand when their description matches
					your prompt. All selected by default -- the agent self-prunes via descriptions,
					so unused ones cost nothing.
				</p>
			</div>
			<div className="flex items-center justify-between gap-2">
				<p className="font-mono text-[11px] text-[var(--ret-text-dim)]">
					{selected.size} of {skills.length} selected
				</p>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={onSelectAll}
						disabled={allSelected}
						className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-purple)] hover:underline disabled:opacity-40"
					>
						select all
					</button>
					<span className="text-[var(--ret-text-muted)]">.</span>
					<button
						type="button"
						onClick={onDeselectAll}
						disabled={selected.size === 0}
						className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)] hover:text-[var(--ret-red)] disabled:opacity-40"
					>
						clear
					</button>
				</div>
			</div>
			<div className="max-h-[55vh] space-y-3 overflow-y-auto border border-[var(--ret-border)] bg-[var(--ret-bg)] p-3">
				{grouped.map(([cat, list]) => (
					<div key={cat}>
						<p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							{cat} . {list.length}
						</p>
						<div className="grid gap-1 sm:grid-cols-2">
							{list.map((s) => {
								const on = selected.has(s.slug);
								return (
									<label
										key={s.slug}
										className={cn(
											"flex cursor-pointer items-start gap-2 border px-2 py-1.5",
											on
												? "border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)]"
												: "border-[var(--ret-border)] bg-[var(--ret-bg-soft)] hover:bg-[var(--ret-surface)]",
										)}
									>
										<input
											type="checkbox"
											checked={on}
											onChange={() => onToggle(s.slug)}
											className="mt-0.5 accent-[var(--ret-purple)]"
										/>
										<span className="min-w-0 flex-1">
											<span className="font-mono text-[11px] text-[var(--ret-text)]">
												{s.name}
											</span>
											<p className="line-clamp-2 text-[10px] text-[var(--ret-text-dim)]">
												{s.description}
											</p>
										</span>
									</label>
								);
							})}
						</div>
					</div>
				))}
			</div>
			<div className="flex items-center justify-between gap-2">
				<ReticleButton variant="ghost" size="md" onClick={onBack}>
					{"<- Back"}
				</ReticleButton>
				<ReticleButton variant="primary" size="md" onClick={onNext}>
					Continue {"->"}
				</ReticleButton>
			</div>
		</div>
	);
}

function ToolsStep({
	agent,
	builtins,
	mcps,
	builtinSelected,
	mcpSelected,
	onToggleBuiltin,
	onToggleMcp,
	onBack,
	onNext,
}: {
	agent: AgentKind;
	builtins: BuiltinTool[];
	mcps: McpServerWithBrand[];
	builtinSelected: Set<string>;
	mcpSelected: Set<string>;
	onToggleBuiltin: (name: string) => void;
	onToggleMcp: (name: string) => void;
	onBack: () => void;
	onNext: () => void;
}) {
	const groupedBuiltins = useMemo(() => {
		const m: Record<string, BuiltinTool[]> = {};
		for (const t of builtins) (m[t.category] ??= []).push(t);
		return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
	}, [builtins]);

	function relevantToAgent(t: BuiltinTool): AgentSupport {
		return t.agent;
	}

	return (
		<div className="space-y-5">
			<div>
				<ReticleLabel>step 3 . tools</ReticleLabel>
				<h1 className="ret-display mt-1 text-2xl">Pick callable tools</h1>
				<p className="mt-1 max-w-[60ch] text-[13px] text-[var(--ret-text-dim)]">
					Tools the agent can call directly -- {builtins.length} built-ins
					(shell, filesystem, browser, vision, ...) plus {mcps.length} MCP
					servers. Tools tagged for the other agent are still selectable but
					won't be wired in this turn.
				</p>
			</div>

			<div className="space-y-3">
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					mcp servers . {mcps.length}
				</p>
				<div className="grid gap-2 sm:grid-cols-2">
					{mcps.map((m) => {
						const on = mcpSelected.has(m.name);
						return (
							<label
								key={m.name}
								className={cn(
									"flex cursor-pointer items-start gap-2 border px-3 py-2",
									on
										? "border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)]"
										: "border-[var(--ret-border)] bg-[var(--ret-bg-soft)] hover:bg-[var(--ret-surface)]",
								)}
							>
								<input
									type="checkbox"
									checked={on}
									onChange={() => onToggleMcp(m.name)}
									className="mt-1 accent-[var(--ret-purple)]"
								/>
								<span className="min-w-0 flex-1">
									<span className="flex items-center gap-1.5">
										{m.brand ? <Logo mark={m.brand} size={12} /> : null}
										<span className="font-mono text-[11px] text-[var(--ret-text)]">
											{m.name}
										</span>
										<span className="font-mono text-[9px] uppercase text-[var(--ret-text-muted)]">
											{m.transport}
										</span>
									</span>
									<p className="text-[10px] text-[var(--ret-text-dim)]">
										{m.tools.length} tools . {m.owner ?? m.source}
									</p>
								</span>
							</label>
						);
					})}
				</div>
			</div>

			<div className="space-y-3">
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					built-in tools . {builtins.length}
				</p>
				<div className="max-h-[40vh] space-y-3 overflow-y-auto border border-[var(--ret-border)] bg-[var(--ret-bg)] p-3">
					{groupedBuiltins.map(([cat, list]) => (
						<div key={cat}>
							<p className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								<ToolIcon name={cat as ToolCategory} size={11} />
								{CATEGORY_LABEL[cat as ToolCategory] ?? cat} . {list.length}
							</p>
							<div className="grid gap-1 sm:grid-cols-2">
								{list.map((t) => {
									const on = builtinSelected.has(t.name);
									const supports = relevantToAgent(t);
									const dim =
										supports !== "both" && supports !== agent;
									return (
										<label
											key={t.name}
											className={cn(
												"flex cursor-pointer items-start gap-2 border px-2 py-1.5",
												on
													? "border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)]"
													: "border-[var(--ret-border)] bg-[var(--ret-bg-soft)] hover:bg-[var(--ret-surface)]",
												dim ? "opacity-60" : "",
											)}
										>
											<input
												type="checkbox"
												checked={on}
												onChange={() => onToggleBuiltin(t.name)}
												className="mt-0.5 accent-[var(--ret-purple)]"
											/>
											<span className="min-w-0 flex-1">
												<span className="flex items-center gap-1.5">
													<ToolIcon
														name={t.category}
														size={11}
														className="text-[var(--ret-text-muted)]"
													/>
													<span className="font-mono text-[11px] text-[var(--ret-text)]">
														{t.name}
													</span>
													{dim ? (
														<span className="font-mono text-[9px] uppercase text-[var(--ret-amber)]">
															other agent
														</span>
													) : null}
												</span>
												<p className="line-clamp-1 pl-[18px] text-[10px] text-[var(--ret-text-dim)]">
													{t.title}
												</p>
											</span>
										</label>
									);
								})}
							</div>
						</div>
					))}
				</div>
			</div>

			<div className="flex items-center justify-between gap-2">
				<ReticleButton variant="ghost" size="md" onClick={onBack}>
					{"<- Back"}
				</ReticleButton>
				<ReticleButton variant="primary" size="md" onClick={onNext}>
					Continue {"->"}
				</ReticleButton>
			</div>
		</div>
	);
}

function KeyStep({
	hasKey,
	ownerKey,
	value,
	onChange,
	busy,
	canProvision,
	onBack,
	onProvision,
}: {
	hasKey: boolean;
	ownerKey: boolean;
	value: string;
	onChange: (v: string) => void;
	busy: boolean;
	canProvision: boolean;
	onBack: () => void;
	onProvision: () => void;
}) {
	return (
		<div className="space-y-5">
			<div>
				<ReticleLabel>step 4 . key</ReticleLabel>
				<h1 className="ret-display mt-1 text-2xl">Bring a Dedalus key</h1>
				<p className="mt-1 max-w-[60ch] text-[13px] text-[var(--ret-text-dim)]">
					Get one at{" "}
					<a
						href="https://www.dedaluslabs.ai/dashboard/api-keys"
						target="_blank"
						rel="noreferrer"
						className="text-[var(--ret-purple)] underline"
					>
						dedaluslabs.ai/dashboard/api-keys
					</a>
					. Stored in your Clerk private metadata, never sent to the browser.
					Same key authenticates inference too -- one key, two endpoints.
				</p>
			</div>
			<label className="flex flex-col gap-1.5">
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					Dedalus API key
				</span>
				<input
					type="password"
					autoComplete="off"
					placeholder="dsk-live-..."
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2 font-mono text-[12px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-none"
				/>
				<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
					{hasKey
						? "On file. Leave blank to keep the existing key."
						: ownerKey
							? "Owner default exists. Leave blank to inherit."
							: "Required to provision."}
				</span>
			</label>
			<div className="flex items-center justify-between gap-2">
				<ReticleButton variant="ghost" size="md" onClick={onBack} disabled={busy}>
					{"<- Back"}
				</ReticleButton>
				<ReticleButton
					variant="primary"
					size="md"
					onClick={onProvision}
					disabled={busy || !canProvision}
				>
					{busy ? (
						<BrailleSpinner name="braille" label="Saving..." className="text-sm" />
					) : (
						<>Boot rig {"->"}</>
					)}
				</ReticleButton>
			</div>
		</div>
	);
}

function BootStep({
	agent,
	machineId,
	phase,
	done,
	busy,
	error,
	onRetry,
}: {
	agent: AgentKind;
	machineId: string | null;
	phase: string | null;
	done: boolean;
	busy: boolean;
	error: string | null;
	onRetry: () => void;
}) {
	const steps = [
		{ id: "create", label: "Submit machine create", isDone: !!machineId },
		{ id: "schedule", label: "Dedalus schedules", isDone: phase === "running" || phase === "starting" || phase === "wake_pending" },
		{ id: "boot", label: "VM boots", isDone: phase === "running" },
		{ id: "record", label: "Save fleet record", isDone: done },
		{ id: "agent", label: `CLI bootstraps ${AGENT_LABEL[agent]}`, isDone: false },
	];
	return (
		<div className="space-y-5">
			<div>
				<ReticleLabel>step 5 . boot</ReticleLabel>
				<h1 className="ret-display mt-1 text-2xl">
					{done ? "Machine accepted" : "Creating your machine"}
				</h1>
				<p className="mt-1 max-w-[60ch] text-[13px] text-[var(--ret-text-dim)]">
					{done
						? "Riding into the dashboard..."
						: "This creates the provider machine and saves it to your fleet. Browser-driven agent bootstrap is not wired yet; use the matching CLI deploy path to install the agent after the VM is accepted."}
				</p>
			</div>

			{error ? (
				<ReticleFrame className="border-[var(--ret-red)]/50 bg-[var(--ret-red)]/5 p-3">
					<p className="font-mono text-[11px] text-[var(--ret-red)]">{error}</p>
					<div className="mt-2">
						<ReticleButton variant="secondary" size="sm" onClick={onRetry} disabled={busy}>
							Retry
						</ReticleButton>
					</div>
				</ReticleFrame>
			) : null}

			<ReticleFrame>
				<ReticleHatch className="h-1.5 border-b border-[var(--ret-border)]" pitch={6} />
				<ol className="divide-y divide-[var(--ret-border)]">
					{steps.map((s, idx) => {
						const active = !s.isDone && (idx === 0 || steps[idx - 1].isDone);
						return (
							<li
								key={s.id}
								className="flex items-center gap-3 px-4 py-2.5 font-mono text-[12px]"
							>
								<span
									className={cn(
										"flex h-5 w-5 items-center justify-center border font-mono text-[10px]",
										s.isDone
											? "border-[var(--ret-green)]/40 bg-[var(--ret-green)]/10 text-[var(--ret-green)]"
											: active
												? "border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
												: "border-[var(--ret-border)] text-[var(--ret-text-muted)]",
									)}
								>
									{s.isDone ? "ok" : active ? <BrailleSpinner /> : "."}
								</span>
								<span
									className={cn(
										"flex-1",
										s.isDone
											? "text-[var(--ret-text)]"
											: active
												? "text-[var(--ret-text)]"
												: "text-[var(--ret-text-muted)]",
									)}
								>
									{s.label}
								</span>
								{idx === 1 && phase ? (
									<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
										{phase}
									</span>
								) : null}
							</li>
						);
					})}
				</ol>
			</ReticleFrame>

			{machineId ? (
				<p className="font-mono text-[10px] text-[var(--ret-text-muted)]">
					machine id . <span className="text-[var(--ret-text)]">{machineId}</span>
				</p>
			) : (
				<p className="font-mono text-[10px] text-[var(--ret-text-muted)]">
					<BrailleSpinner /> waiting for machine id...
				</p>
			)}

			{/*
			  Live transcript of every controlplane phase change + on-VM
			  log line we can pull. Replaces the old "this can take a
			  minute" silence with a real running commentary so the
			  operator can see exactly which step the machine is
			  blocked on (and which Dedalus error code if it's failing).
			*/}
			<BootTranscript active={!done} machineId={machineId} maxHeight={280} />
		</div>
	);
}

function RigPreview({
	agent,
	counts,
	skills,
	builtins,
	mcps,
	bootPhase,
	bootDone,
}: {
	agent: AgentKind;
	counts: { skills: number; builtins: number; mcps: number; mcpTools: number };
	skills: SkillSummary[];
	builtins: BuiltinTool[];
	mcps: McpServerWithBrand[];
	bootPhase: string | null;
	bootDone: boolean;
}) {
	const meta = AGENT_DESC[agent];

	// Pick a couple of skills + tools to spotlight.
	const spotlight = useMemo(() => skills.slice(0, 6), [skills]);
	const toolByCat = useMemo(() => {
		const m: Record<string, BuiltinTool[]> = {};
		for (const t of builtins) (m[t.category] ??= []).push(t);
		return Object.entries(m).slice(0, 6);
	}, [builtins]);

	return (
		<div className="space-y-4 px-5 py-6">
			<div className="flex items-center justify-between gap-2">
				<ReticleLabel>your rig</ReticleLabel>
				{bootPhase ? (
					<ReticleBadge variant={bootDone ? "success" : "warning"}>
						{bootDone ? "ready" : bootPhase}
					</ReticleBadge>
				) : null}
			</div>
			<ReticleFrame>
				<div className="flex items-center gap-3 border-b border-[var(--ret-border)] px-4 py-3">
					<Logo mark={meta.mark} size={28} />
					<div>
						<p className="font-mono text-[14px] text-[var(--ret-text)]">
							{meta.name}
						</p>
						<p className="font-mono text-[10px] text-[var(--ret-text-muted)]">
							{meta.tagline}
						</p>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-px bg-[var(--ret-border)]">
					<Tally label="skills" value={counts.skills} />
					<Tally label="built-in tools" value={counts.builtins} />
					<Tally label="mcp servers" value={counts.mcps} />
					<Tally label="mcp tools" value={counts.mcpTools} />
				</div>
			</ReticleFrame>

			<ReticleFrame>
				<div className="flex items-center justify-between border-b border-[var(--ret-border)] px-4 py-2">
					<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						mcp servers . {mcps.length}
					</p>
				</div>
				<ul className="divide-y divide-[var(--ret-border)]">
					{mcps.length === 0 ? (
						<li className="px-4 py-3 font-mono text-[11px] text-[var(--ret-text-muted)]">
							no MCP servers selected
						</li>
					) : null}
					{mcps.map((m) => (
						<li
							key={m.name}
							className="flex items-center gap-2 px-4 py-2 font-mono text-[11px]"
						>
							{m.brand ? <Logo mark={m.brand} size={12} /> : null}
							<span className="text-[var(--ret-text)]">{m.name}</span>
							<span className="text-[var(--ret-text-muted)]">.</span>
							<span className="text-[var(--ret-text-muted)]">
								{m.tools.length} tools
							</span>
						</li>
					))}
				</ul>
			</ReticleFrame>

			<ReticleFrame>
				<div className="flex items-center justify-between border-b border-[var(--ret-border)] px-4 py-2">
					<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						built-in tool categories
					</p>
				</div>
				<ul className="divide-y divide-[var(--ret-border)]">
					{toolByCat.map(([cat, list]) => (
						<li
							key={cat}
							className="flex items-center justify-between gap-2 px-4 py-1.5 font-mono text-[11px]"
						>
							<span className="flex items-center gap-1.5 text-[var(--ret-text)]">
								<ToolIcon
									name={cat as ToolCategory}
									size={11}
									className="text-[var(--ret-text-muted)]"
								/>
								{CATEGORY_LABEL[cat as ToolCategory] ?? cat}
							</span>
							<span className="font-mono tabular-nums text-[var(--ret-text-muted)]">
								{list.length}
							</span>
						</li>
					))}
				</ul>
			</ReticleFrame>

			<ReticleFrame>
				<div className="flex items-center justify-between border-b border-[var(--ret-border)] px-4 py-2">
					<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						skill spotlight
					</p>
					<span className="font-mono text-[10px] tabular-nums text-[var(--ret-text-muted)]">
						{spotlight.length} / {skills.length}
					</span>
				</div>
				<ul className="divide-y divide-[var(--ret-border)]">
					{spotlight.map((s) => (
						<li
							key={s.slug}
							className="px-4 py-1.5 font-mono text-[11px] text-[var(--ret-text)]"
						>
							<span className="text-[var(--ret-text-muted)]">.</span> {s.name}
						</li>
					))}
				</ul>
			</ReticleFrame>

			{!bootPhase ? (
				<p className="font-mono text-[10px] text-[var(--ret-text-muted)]">
					{counts.skills > 0 || counts.builtins > 0 ? null : (
						<BrailleSpinner label="building your rig" />
					)}
				</p>
			) : null}
		</div>
	);
}

function Tally({ label, value }: { label: string; value: number }) {
	return (
		<div className="flex flex-col gap-0.5 bg-[var(--ret-bg)] px-3 py-2">
			<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				{label}
			</p>
			<p className="font-mono text-base tabular-nums text-[var(--ret-text)]">
				{value}
			</p>
		</div>
	);
}

void BUILTIN_TOOLS;
