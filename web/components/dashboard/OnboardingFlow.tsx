"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { BootTranscript } from "@/components/dashboard/BootTranscript";
import { Logo, type Mark } from "@/components/Logo";
import { ServiceIcon, isServiceSlug } from "@/components/ServiceIcon";
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
	agentCredentialRequirements,
	canBootstrapAgent,
	type DraftAiKeys,
} from "@/lib/agents/credentials";
import {
	BUILTIN_TOOLS,
	CATEGORY_LABEL,
	type BuiltinTool,
	type ToolCategory,
} from "@/lib/dashboard/loadout";
import type { McpServerWithBrand } from "@/lib/dashboard/mcps";
import type { SkillSummary } from "@/lib/dashboard/types";
import {
	AGENT_LABEL,
	PROVIDER_KINDS,
	PROVIDER_LABEL,
	type AgentKind,
	type AgentProfile,
	type LoadoutPreset,
	type ProviderKind,
	type PublicUserConfig,
	type MachineSpec,
} from "@/lib/user-config/schema";

const MARK_SET = new Set<string>(["am", "dedalus", "nous", "cursor", "openclaw", "anthropic", "openai"]);
function isMark(value: string): value is Mark { return MARK_SET.has(value); }

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

type Step = "agent" | "skills" | "tools" | "provider" | "key" | "boot";

const STEPS: ReadonlyArray<{ id: Step; label: string; hint: string }> = [
	{ id: "agent", label: "Agent", hint: "personality" },
	{ id: "skills", label: "Skills", hint: "auto-loaded knowledge" },
	{ id: "tools", label: "Tools", hint: "callable surface" },
	{ id: "provider", label: "Provider", hint: "where it runs" },
	{ id: "key", label: "Key", hint: "provider token" },
	{ id: "boot", label: "Boot", hint: "spin up rig" },
];

const PROVIDERS_META: Record<
	ProviderKind,
	{
		name: string;
		tagline: string;
		keyLabel: string;
		keyPlaceholder: string;
		keyHint: string;
		secondaryFields?: ReadonlyArray<{
			label: string;
			placeholder: string;
			field: string;
		}>;
	}
> = {
	dedalus: {
		name: "Dedalus Machines",
		tagline:
			"Linux VMs with sleep/wake, persistent disk, cloudflared previews. The original.",
		keyLabel: "Dedalus API key",
		keyPlaceholder: "dsk-live-...",
		keyHint: "Get one at dedaluslabs.ai/dashboard/api-keys",
	},
	sprites: {
		name: "Sprites",
		tagline:
			"Persistent Linux sandboxes on Sprites.dev. Auto-sleep, instant wake, checkpoints, public URLs. Runs on Fly.io infrastructure.",
		keyLabel: "Sprites token",
		keyPlaceholder: "kevin-liu-553/...",
		keyHint: "Get one at sprites.dev/account",
	},
	e2b: {
		name: "E2B Sandbox",
		tagline:
			"Full Linux sandboxes with pause/resume, snapshots, and public URLs. Best for stable agent work with fast cold starts.",
		keyLabel: "E2B API key",
		keyPlaceholder: "e2b_...",
		keyHint: "Get one at e2b.dev/dashboard",
	},
};

const COMPARISON_ROWS: ReadonlyArray<{
	label: string;
	dedalus: string;
	e2b: string;
	sprites: string;
}> = [
	{ label: "Type", dedalus: "Persistent VM", e2b: "Pausable sandbox", sprites: "Persistent sandbox" },
	{ label: "OS", dedalus: "Ubuntu", e2b: "Debian 12", sprites: "Linux" },
	{ label: "Sleep / wake", dedalus: "Manual", e2b: "Pause / resume", sprites: "Auto-sleep / auto-wake" },
	{ label: "Cold start", dedalus: "~30s", e2b: "Instant", sprites: "~5s" },
	{ label: "Storage", dedalus: "Persistent disk", e2b: "Persists across pause", sprites: "Persistent ext4" },
	{ label: "Public URLs", dedalus: "Preview URLs", e2b: "Per-port host", sprites: "Per-sprite URL" },
	{ label: "Snapshots", dedalus: "\u2014", e2b: "Full snapshots", sprites: "~300ms checkpoints" },
	{ label: "Max lifetime", dedalus: "Unlimited", e2b: "24h (Pro) / 1h", sprites: "Unlimited" },
	{ label: "Best for", dedalus: "Production agents", e2b: "Fast iteration", sprites: "Always-on services" },
];

const AGENT_DESC: Record<
	AgentKind,
	{
		name: string;
		mark: "nous" | "openclaw" | "anthropic" | "openai";
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
			"Persistent computer-use state under /home/machine/.openclaw",
			"Browser + screenshot + click-by-coordinates on the VM",
			"Bootstrappable from the UI like Hermes, with the same fleet controls",
		],
		links: [
			{ label: "github", href: "https://github.com/openclaw/openclaw" },
			{ label: "ddls cookbook", href: "https://github.com/dedalus-labs/openclaw-ddls" },
		],
	},
	"claude-code": {
		name: "Claude Code",
		mark: "anthropic",
		tagline: "Agentic coding. File edit + shell + SDK.",
		bullets: [
			"Terminal coding agent with deep repo awareness and multi-step tool use",
			"Headless execution via claude -p for automation and cron workflows",
			"Agent SDK for programmatic control from TypeScript or Python",
		],
		links: [
			{ label: "github", href: "https://github.com/anthropics/claude-code" },
			{ label: "docs", href: "https://code.claude.com/docs/" },
		],
	},
	codex: {
		name: "Codex CLI",
		mark: "openai",
		tagline: "Agentic coding. Sandbox + exec mode.",
		bullets: [
			"Terminal coding agent with sandbox isolation and workspace-write modes",
			"Non-interactive via codex exec for CI/CD pipelines and automation",
			"JSONL output for programmatic parsing and integration",
		],
		links: [
			{ label: "github", href: "https://github.com/openai/codex" },
			{ label: "docs", href: "https://developers.openai.com/codex/" },
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
	const [provider, setProvider] = useState<ProviderKind>(
		initialConfig.draftProviderKind ?? "dedalus",
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
	const [providerKey, setProviderKey] = useState("");
	const [aiKeys, setAiKeys] = useState({ anthropic: "", openai: "" });
	const [providerSecondary, setProviderSecondary] = useState<
		Record<string, string>
	>({});
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Boot state
	const [bootMachineId, setBootMachineId] = useState<string | null>(null);
	const [bootPhase, setBootPhase] = useState<string | null>(null);
	const [bootDone, setBootDone] = useState(false);

	const hasKey = initialConfig.providers[provider].configured;
	const ownerKey = provider === "dedalus" && defaults.hasOwnerDedalusKey;

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
			const selectedSkills = Array.from(skillSel).sort();
			const selectedTools = Array.from(builtinSel).sort();
			const selectedMcps = Array.from(mcpSel).sort();
			const loadoutPatch = buildOnboardingLoadoutPatch({
				config: initialConfig,
				agent,
				selectedSkills,
				selectedTools,
				selectedMcps,
				skills,
				builtins,
				mcps,
			});

			// Build provider-specific credentials payload.
			const setupBody: Record<string, unknown> = {
				draftAgentKind: agent,
				draftProviderKind: provider,
			};
			if (providerKey.trim()) {
				const cred: Record<string, unknown> = { apiKey: providerKey.trim() };
				const meta = PROVIDERS_META[provider];
				if (meta.secondaryFields) {
					for (const f of meta.secondaryFields) {
						const v = providerSecondary[f.field]?.trim();
						if (v) cred[f.field] = v;
					}
				}
				setupBody.providerCredentials = { [provider]: cred };
			}
			const aiProviderKeys: Record<string, string> = {};
			if (aiKeys.anthropic.trim()) aiProviderKeys.anthropic = aiKeys.anthropic.trim();
			if (aiKeys.openai.trim()) aiProviderKeys.openai = aiKeys.openai.trim();
			if (Object.keys(aiProviderKeys).length > 0) {
				setupBody.aiProviderKeys = aiProviderKeys;
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

			const settingsResp = await fetch("/api/dashboard/admin/settings", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(loadoutPatch),
			});
			if (!settingsResp.ok) {
				const body = (await settingsResp.json().catch(() => ({}))) as {
					message?: string;
				};
				throw new Error(
					body.message ?? `loadout save failed (HTTP ${settingsResp.status})`,
				);
			}

			// Provision machine via the selected provider.
			const provResp = await fetch("/api/dashboard/admin/provision-machine", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					providerKind: provider,
					agentKind: agent,
				}),
			});
			// Server may return a non-JSON body on 5xx (gateway HTML page,
			// empty Vercel error). Fall back to an empty object so the
			// HTTP-status message below is still actionable instead of a
			// JSON-parse exception that obscures the real failure.
			const provBody = (await provResp.json().catch(() => ({}))) as {
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

			const bootResp = await fetch("/api/dashboard/admin/bootstrap", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ machineId: provBody.machineId }),
			});
			const bootBody = (await bootResp.json().catch(() => ({}))) as {
				message?: string;
				error?: string;
			};
			if (!bootResp.ok) {
				throw new Error(
					bootBody.message ??
						bootBody.error ??
						`bootstrap failed (HTTP ${bootResp.status})`,
				);
			}
			setBootPhase("bootstrapped");
			setBootDone(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : "provision failed");
		} finally {
			setBusy(false);
		}
	}, [agent, aiKeys, builtinSel, initialConfig, mcpSel, provider, providerKey, providerSecondary, skillSel]);

	const agentCredDraft: DraftAiKeys = {
		anthropic: aiKeys.anthropic,
		openai: aiKeys.openai,
		dedalus: provider === "dedalus" ? providerKey : undefined,
	};
	const agentCredsOk = canBootstrapAgent(
		agent,
		{ providers: initialConfig.providers, aiProviders: initialConfig.aiProviders },
		agentCredDraft,
	);
	const canProvisionInfra = hasKey || ownerKey || providerKey.trim().length > 0;
	const canProvision = canProvisionInfra && agentCredsOk;

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
					skip →
					</a>
					</div>
				</div>
			</header>

			<div className="relative z-10 mx-auto grid max-w-[var(--ret-content-max)] gap-px bg-[var(--ret-border)] lg:grid-cols-[1.4fr_1fr]">
				<section className="bg-[var(--ret-bg)] p-6">
					<StepRail step={step} />

					{error ? (
					<ReticleFrame className="mt-4 border-[var(--ret-red)]/50 bg-[var(--ret-red)]/5 p-3">
						<p className="text-[11px] text-[var(--ret-red)]">
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
						{step === "provider" ? (
							<ProviderPickStep
								value={provider}
								configured={initialConfig.providers}
								onPick={(p) => {
									setProvider(p);
									setProviderKey("");
									setProviderSecondary({});
								}}
								onBack={back}
								onNext={next}
							/>
						) : null}
						{step === "key" ? (
							<KeyStep
								agent={agent}
								provider={provider}
								config={initialConfig}
								hasKey={hasKey}
								ownerKey={ownerKey}
								value={providerKey}
								onChange={setProviderKey}
								aiKeys={aiKeys}
								onAiKeyChange={(field, val) =>
									setAiKeys((prev) => ({ ...prev, [field]: val }))
								}
								agentCredsOk={agentCredsOk}
								secondary={providerSecondary}
								onSecondaryChange={(field, val) =>
									setProviderSecondary((prev) => ({ ...prev, [field]: val }))
								}
								busy={busy}
								canProvision={canProvision}
								onBack={back}
								onProvision={handleStartBoot}
							/>
						) : null}
						{step === "boot" ? (
							<BootStep
								agent={agent}
								provider={provider}
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
						className="pointer-events-none absolute -right-8 -top-8 flex h-[420px] w-[420px] items-start justify-end opacity-[0.07] dark:opacity-[0.10]"
					>
						<Logo mark="am" size={360} tone="auto" />
					</div>
					<RigPreview
						agent={agent}
						provider={provider}
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
		<ol className="grid grid-cols-3 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] sm:grid-cols-6">
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
							<p className="truncate text-[11px] text-[var(--ret-text)]">
								{s.label}
							</p>
							<p className="truncate text-[10px] text-[var(--ret-text-muted)]">
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
										<h2 className="text-[14px] font-medium text-[var(--ret-text)]">
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
								<ul className="space-y-0.5 text-[10px] text-[var(--ret-text-muted)]">
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
									{l.label} →
								</a>
								))}
							</div>
						</div>
					);
				})}
			</div>
			<div className="flex justify-end">
				<ReticleButton variant="primary" size="md" onClick={onNext}>
					Continue →
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
											<span className="text-[11px] text-[var(--ret-text)]">
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
					← Back
				</ReticleButton>
				<ReticleButton variant="primary" size="md" onClick={onNext}>
					Continue →
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
										{m.brand ? (
											isMark(m.brand) ? <Logo mark={m.brand} size={12} /> :
											isServiceSlug(m.brand) ? <ServiceIcon slug={m.brand} size={12} /> : null
										) : null}
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
									const dim = false;
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
					← Back
				</ReticleButton>
				<ReticleButton variant="primary" size="md" onClick={onNext}>
					Continue →
				</ReticleButton>
			</div>
		</div>
	);
}

function ProviderComparison({ selected }: { selected: ProviderKind }) {
	const COLS: ReadonlyArray<{ key: keyof (typeof COMPARISON_ROWS)[number]; label: string }> = [
		{ key: "dedalus", label: "Dedalus" },
		{ key: "e2b", label: "E2B" },
		{ key: "sprites", label: "Sprites" },
	];

	return (
		<ReticleFrame>
			<div className="border-b border-[var(--ret-border)] px-4 py-2">
				<ReticleLabel>compare</ReticleLabel>
			</div>
			<div className="overflow-x-auto">
				<table className="w-full text-[12px]">
					<thead>
						<tr className="border-b border-[var(--ret-border)]">
							<th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								Feature
							</th>
							{COLS.map((col) => (
								<th
									key={col.key}
									className={cn(
										"px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.18em]",
										selected === col.key
											? "bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
											: "text-[var(--ret-text-muted)]",
									)}
								>
									{col.label}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{COMPARISON_ROWS.map((row) => (
							<tr key={row.label} className="border-b border-[var(--ret-border)] last:border-b-0">
								<td className="whitespace-nowrap px-3 py-1.5 text-[var(--ret-text-muted)]">
									{row.label}
								</td>
								{COLS.map((col) => (
									<td
										key={col.key}
										className={cn(
											"px-3 py-1.5",
											selected === col.key
												? "bg-[var(--ret-purple-glow)] text-[var(--ret-text)]"
												: "text-[var(--ret-text-dim)]",
										)}
									>
										<span className="font-mono text-[11px]">{row[col.key]}</span>
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</ReticleFrame>
	);
}

function ProviderPickStep({
	value,
	configured,
	onPick,
	onBack,
	onNext,
}: {
	value: ProviderKind;
	configured: Record<ProviderKind, { configured: boolean; scopeHint?: string }>;
	onPick: (kind: ProviderKind) => void;
	onBack: () => void;
	onNext: () => void;
}) {
	return (
		<div className="space-y-5">
			<div>
				<ReticleLabel>step 4 . provider</ReticleLabel>
				<h1 className="ret-display mt-1 text-2xl">
					Pick where it runs
				</h1>
				<p className="mt-1 max-w-[60ch] text-[13px] text-[var(--ret-text-dim)]">
					The infrastructure provider hosting your agent&rsquo;s VM.
				Dedalus is the default and fully wired. E2B Sandbox and
				Sprites are available as alternative hosts.
				</p>
			</div>
			<div className="grid gap-3 md:grid-cols-3">
				{PROVIDER_KINDS.map((kind) => {
					const meta = PROVIDERS_META[kind];
					const selected = value === kind;
					const hasCreds = configured[kind].configured;
					return (
						<button
							key={kind}
							type="button"
							onClick={() => onPick(kind)}
							className={cn(
								"group flex flex-col gap-3 border p-4 text-left transition-colors",
								selected
									? "border-[var(--ret-purple)] bg-[var(--ret-purple-glow)]"
									: "border-[var(--ret-border)] bg-[var(--ret-bg)] hover:border-[var(--ret-border-hover)]",
							)}
						>
							<div className="flex items-center justify-between gap-2">
							<h2 className="text-[13px] font-medium text-[var(--ret-text)]">
								{meta.name}
							</h2>
								<div className="flex items-center gap-1.5">
									{hasCreds ? (
										<ReticleBadge variant="success">key on file</ReticleBadge>
									) : null}
									{selected ? (
										<ReticleBadge variant="accent">selected</ReticleBadge>
									) : null}
								</div>
							</div>
							<p className="text-[12px] text-[var(--ret-text-dim)]">
								{meta.tagline}
							</p>
							<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								provider: {kind}
							</span>
						</button>
					);
				})}
			</div>
			<ProviderComparison selected={value} />
			<div className="flex items-center justify-between gap-2">
				<ReticleButton variant="ghost" size="md" onClick={onBack}>
					← Back
				</ReticleButton>
				<ReticleButton variant="primary" size="md" onClick={onNext}>
					Continue →
				</ReticleButton>
			</div>
		</div>
	);
}

function KeyStep({
	agent,
	provider,
	config,
	hasKey,
	ownerKey,
	value,
	onChange,
	aiKeys,
	onAiKeyChange,
	agentCredsOk,
	secondary,
	onSecondaryChange,
	busy,
	canProvision,
	onBack,
	onProvision,
}: {
	agent: AgentKind;
	provider: ProviderKind;
	config: PublicUserConfig;
	hasKey: boolean;
	ownerKey: boolean;
	value: string;
	onChange: (v: string) => void;
	aiKeys: { anthropic: string; openai: string };
	onAiKeyChange: (field: "anthropic" | "openai", val: string) => void;
	agentCredsOk: boolean;
	secondary: Record<string, string>;
	onSecondaryChange: (field: string, val: string) => void;
	busy: boolean;
	canProvision: boolean;
	onBack: () => void;
	onProvision: () => void;
}) {
	const meta = PROVIDERS_META[provider];
	const agentReqs = agentCredentialRequirements(agent).filter(
		(r) => r.field !== "dedalus" || provider !== "dedalus",
	);
	return (
		<div className="space-y-5">
			<div>
				<ReticleLabel>step 5 . keys</ReticleLabel>
				<h1 className="ret-display mt-1 text-2xl">
					Bring your keys
				</h1>
				<p className="mt-1 max-w-[60ch] text-[13px] text-[var(--ret-text-dim)]">
					Infrastructure key provisions the {PROVIDER_LABEL[provider]} machine.
					AI provider keys power {AGENT_LABEL[agent]}. Stored in private metadata.
				</p>
			</div>
			<ReticleLabel>infrastructure</ReticleLabel>
			<label className="flex flex-col gap-1.5">
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{meta.keyLabel}
				</span>
				<input
					type="password"
					autoComplete="off"
					placeholder={meta.keyPlaceholder}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2 font-mono text-[12px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-none"
				/>
				<span className="text-[10px] text-[var(--ret-text-muted)]">
					{hasKey
						? "On file. Leave blank to keep the existing key."
						: ownerKey
							? "Owner default exists. Leave blank to inherit."
							: "Required to provision."}
					{provider === "dedalus" &&
					(agent === "hermes" || agent === "openclaw")
						? " Also routes LLM inference when no separate AI key is set."
						: ""}
				</span>
			</label>
			{meta.secondaryFields?.map((f) => (
				<label key={f.field} className="flex flex-col gap-1.5">
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						{f.label}
					</span>
					<input
						type="text"
						autoComplete="off"
						placeholder={f.placeholder}
						value={secondary[f.field] ?? ""}
						onChange={(e) => onSecondaryChange(f.field, e.target.value)}
						className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2 font-mono text-[12px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-none"
					/>
				</label>
			))}
			{agentReqs.length > 0 ? (
				<>
					<ReticleLabel>agent inference · {AGENT_LABEL[agent]}</ReticleLabel>
					{agentReqs.map((req) => {
						if (req.field === "dedalus") return null;
						const field = req.field as "anthropic" | "openai";
						const onFile = config.aiProviders[field]?.configured ?? false;
						return (
							<label key={req.field} className="flex flex-col gap-1.5">
								<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
									{req.label}
									{req.required ? " *" : ""}
								</span>
								<input
									type="password"
									autoComplete="off"
									placeholder={req.hint}
									value={aiKeys[field]}
									onChange={(e) => onAiKeyChange(field, e.target.value)}
									className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2 font-mono text-[12px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-none"
								/>
								<span className="text-[10px] text-[var(--ret-text-muted)]">
									{onFile
										? "On file. Leave blank to keep."
										: req.required
											? "Required for headless bootstrap."
											: "Optional — improves upstream routing."}
									{req.signupUrl ? (
										<>
											{" "}
											<a
												href={req.signupUrl}
												target="_blank"
												rel="noopener noreferrer"
												className="text-[var(--ret-purple)] underline-offset-2 hover:underline"
											>
												Get a key
											</a>
										</>
									) : null}
								</span>
							</label>
						);
					})}
					{(agent === "claude-code" || agent === "codex") ? (
						<p className="text-[10px] text-[var(--ret-text-muted)]">
							Subscription sign-in ({agent === "claude-code" ? "claude auth login" : "codex login"}) is
							interactive-only — run it in the machine terminal after boot. API keys enable headless setup.
						</p>
					) : null}
				</>
			) : null}
			{!agentCredsOk ? (
				<p className="text-[11px] text-[var(--ret-amber)]">
					Add the required AI provider key(s) above before booting {AGENT_LABEL[agent]}.
				</p>
			) : null}
			<div className="flex items-center justify-between gap-2">
				<ReticleButton variant="ghost" size="md" onClick={onBack} disabled={busy}>
					← Back
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
						<>Boot rig →</>
					)}
				</ReticleButton>
			</div>
		</div>
	);
}

function BootStep({
	agent,
	provider,
	machineId,
	phase,
	done,
	busy,
	error,
	onRetry,
}: {
	agent: AgentKind;
	provider: ProviderKind;
	machineId: string | null;
	phase: string | null;
	done: boolean;
	busy: boolean;
	error: string | null;
	onRetry: () => void;
}) {
	const isCliAgent = agent === "claude-code" || agent === "codex";
	const steps = [
		{ id: "create", label: "Submit machine create", isDone: !!machineId },
		{ id: "schedule", label: `${PROVIDER_LABEL[provider]} schedules`, isDone: phase === "running" || phase === "starting" || phase === "wake_pending" },
		{ id: "boot", label: "VM boots", isDone: phase === "running" },
		{ id: "record", label: "Save fleet record + selected loadout", isDone: !!machineId },
		{ id: "agent", label: `Bootstrap ${AGENT_LABEL[agent]} ${isCliAgent ? "environment" : "gateway"}`, isDone: done },
	];
	return (
		<div className="space-y-5">
			<div>
				<ReticleLabel>step 6 . boot</ReticleLabel>
				<h1 className="ret-display mt-1 text-2xl">
					{done ? (isCliAgent ? "Agent environment ready" : "Agent gateway ready") : "Creating your machine"}
				</h1>
				<p className="mt-1 max-w-[60ch] text-[13px] text-[var(--ret-text-dim)]">
					{done
						? "Riding into the dashboard..."
						: isCliAgent
							? `This creates a ${PROVIDER_LABEL[provider]} machine, saves your selected loadout, and bootstraps the ${AGENT_LABEL[agent]} environment.`
							: `This creates a ${PROVIDER_LABEL[provider]} machine, saves your selected loadout, bootstraps ${AGENT_LABEL[agent]}, and wires the gateway back into your account.`}
				</p>
			</div>

			{error ? (
				<ReticleFrame className="border-[var(--ret-red)]/50 bg-[var(--ret-red)]/5 p-3">
					<p className="text-[11px] text-[var(--ret-red)]">{error}</p>
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
								className="flex items-center gap-3 px-4 py-2.5 text-[12px]"
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
					machine id .{" "}
					<span className="text-[var(--ret-text)]">{machineId}</span>
				</p>
			) : (
				<p className="text-[10px] text-[var(--ret-text-muted)]">
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

function buildOnboardingLoadoutPatch({
	config,
	agent,
	selectedSkills,
	selectedTools,
	selectedMcps,
	skills,
	builtins,
	mcps,
}: {
	config: PublicUserConfig;
	agent: AgentKind;
	selectedSkills: string[];
	selectedTools: string[];
	selectedMcps: string[];
	skills: SkillSummary[];
	builtins: BuiltinTool[];
	mcps: McpServerWithBrand[];
}) {
	const now = new Date().toISOString();
	const profileId = `${agent}-default`;
	const presetId = `onboarding-${agent}`;
	const existingProfile = config.agentProfiles.find((p) => p.id === profileId);
	const fallbackProfile = config.agentProfiles.find((p) => p.agentKind === agent);
	const gatewayProfileId =
		existingProfile?.gatewayProfileId ??
		fallbackProfile?.gatewayProfileId ??
		config.gatewayProfiles[0]?.id ??
		"dedalus-default";
	// Clerk publicMetadata has an 8KB limit. Sending 161 skill slugs +
	// 30 MCP names + 23 tool names (x2 for profile + preset) blows it.
	// Use ["*"] as a wildcard meaning "all bundled" when every item is
	// selected. The dashboard resolves "*" to the full list at read time.
	const allSkills = selectedSkills.length === skills.length;
	const allTools = selectedTools.length === builtins.length;
	const allMcps = selectedMcps.length === mcps.length;
	const profileSkills = allSkills ? ["*"] : selectedSkills;
	const profileTools = allTools ? ["*"] : selectedTools;
	const profileMcps = allMcps ? ["*"] : selectedMcps;

	const nextProfile: AgentProfile = {
		id: existingProfile?.id ?? fallbackProfile?.id ?? profileId,
		name: existingProfile?.name ?? fallbackProfile?.name ?? `${AGENT_LABEL[agent]} default`,
		agentKind: agent,
		gatewayProfileId,
		model: existingProfile?.model ?? fallbackProfile?.model ?? config.draftModel,
		enabledSkills: profileSkills,
		enabledTools: profileTools,
		enabledMcpServers: profileMcps,
		environmentProfileId:
			existingProfile?.environmentProfileId ??
			fallbackProfile?.environmentProfileId ??
			null,
		createdAt: existingProfile?.createdAt ?? fallbackProfile?.createdAt ?? now,
		updatedAt: now,
	};
	const nextPreset: LoadoutPreset = {
		id: presetId,
		name: `${AGENT_LABEL[agent]} onboarding loadout`,
		description:
			"Skills, built-in tools, and MCP servers selected in the first-run onboarding flow.",
		sourceIds: ["bundled-skills", "bundled-mcps", "builtin-tools"],
		customEntryIds: [],
		enabledSkillIds: profileSkills,
		enabledToolIds: profileTools,
		enabledMcpServerIds: profileMcps,
		createdAt:
			config.loadoutPresets.find((preset) => preset.id === presetId)?.createdAt ??
			now,
		updatedAt: now,
	};
	return {
		agentProfiles: upsertById(config.agentProfiles, nextProfile),
		loadoutPresets: upsertById(config.loadoutPresets, nextPreset),
		activeLoadoutPresetId: presetId,
	};
}

function upsertById<T extends { id: string }>(items: T[], next: T): T[] {
	const index = items.findIndex((item) => item.id === next.id);
	if (index === -1) return [...items, next];
	return items.map((item) => (item.id === next.id ? next : item));
}

function RigPreview({
	agent,
	provider,
	counts,
	skills,
	builtins,
	mcps,
	bootPhase,
	bootDone,
}: {
	agent: AgentKind;
	provider: ProviderKind;
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
						<p className="text-[14px] font-medium text-[var(--ret-text)]">
							{meta.name}
						</p>
						<p className="text-[10px] text-[var(--ret-text-muted)]">
							{meta.tagline}
						</p>
						<p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							on {PROVIDER_LABEL[provider]}
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
						<li className="px-4 py-3 text-[11px] text-[var(--ret-text-muted)]">
							no MCP servers selected
						</li>
					) : null}
					{mcps.map((m) => (
						<li
							key={m.name}
							className="flex items-center gap-2 px-4 py-2 font-mono text-[11px]"
						>
							{m.brand ? (
								isMark(m.brand) ? <Logo mark={m.brand} size={12} /> :
								isServiceSlug(m.brand) ? <ServiceIcon slug={m.brand} size={12} /> : null
							) : null}
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
						className="px-4 py-1.5 text-[11px] text-[var(--ret-text)]"
					>
						<span className="text-[var(--ret-text-muted)]">.</span> {s.name}
					</li>
					))}
				</ul>
			</ReticleFrame>

			{!bootPhase ? (
				<p className="text-[10px] text-[var(--ret-text-muted)]">
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
