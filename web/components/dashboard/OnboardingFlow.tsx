"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { BrandMark } from "@/components/BrandMark";
import { AgentInfoPanel, MachineInfoPanel } from "@/components/dashboard/AgentMachineInfo";
import { BootTranscript } from "@/components/dashboard/BootTranscript";
import { RouterSelect } from "@/components/dashboard/RouterSelect";
import { Logo, type Mark } from "@/components/Logo";
import { providerLogoMark } from "@/lib/fleet/logos";
import { ServiceIcon, isServiceSlug } from "@/components/ServiceIcon";
import { ThemeToggle } from "@/components/ThemeToggle";
import { QuickstartGuide } from "@/components/dashboard/QuickstartGuide";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { BrailleSpinner } from "@/components/ui/BrailleSpinner";
import { ArrowLeft, ArrowRight, ArrowUpRight, Brain, Check, CheckCircle2, ChevronDown, KeyRound, PackageOpen, ShieldCheck } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { waitForControlPlaneOperation } from "@/lib/control-plane/client";
import { onboardingProviderReady, onboardingWorkspaceUrl, submitOnboardingLaunch, type OnboardingLaunch } from "@/lib/onboarding/launch";
import { selectedPreset as resolveSelectedPreset } from "@/lib/onboarding/preset-selection";
import {
	agentCredentialRequirements,
	canBootstrapAgent,
	type DraftAiKeys,
} from "@/lib/agents/credentials";
import {
	type AgentUpstreamReadiness,
	DEFAULT_ROUTER_ID,
	agentUpstreamReadiness,
	agentUsesRouter,
} from "@/lib/agents/upstreams";
import type { Preset } from "@/lib/dashboard/presets";
import {
	AGENT_LABEL,
	PROVIDER_KINDS,
	PROVIDER_LABEL,
	type AgentKind,
	type ProviderKind,
	type PublicUserConfig,
} from "@/lib/user-config/schema";

const MARK_SET = new Set<string>(["am", "daytona", "nous", "cursor", "openclaw", "anthropic", "openai"]);
function isMark(value: string): value is Mark { return MARK_SET.has(value); }

type OnboardingAiKeys = {
	vercelAiGateway: string;
	openrouter: string;
	anthropic: string;
	openai: string;
};

type OnboardingAiKeyField = keyof OnboardingAiKeys;

type Props = {
	initialConfig: PublicUserConfig;
	presets: Preset[];
	initialPresetId?: string;
	embedded?: boolean;
};

type Step = "welcome" | "connect" | "configure" | "boot";
type StepHeadingLevel = 1 | 2;

const STEPS: ReadonlyArray<{ id: Step; label: string; hint: string }> = [
	{ id: "welcome", label: "Welcome", hint: "what you need" },
	{ id: "connect", label: "Connect", hint: "compute and model accounts" },
	{ id: "configure", label: "Configure", hint: "review and launch" },
	{ id: "boot", label: "Workspace", hint: "launch status and next steps" },
];

/** Sentinel preset id for "start blank, no preset". */
const NO_PRESET = "__none__";

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
	dedalus: { name: "Retired provider", tagline: "Unavailable for new Workers.", keyLabel: "Unavailable", keyPlaceholder: "", keyHint: "Choose a supported provider." },
	daytona: {
		name: "Daytona",
		tagline:
			"Linux sandboxes with native terminals and private preview URLs. Stop and start retain files; running processes restart.",
		keyLabel: "Daytona API key",
		keyPlaceholder: "Daytona API key",
		keyHint: "Create an API key at app.daytona.io. API URL and target are optional.",
		secondaryFields: [
			{ label: "API URL (optional)", placeholder: "https://app.daytona.io/api", field: "apiUrl" },
			{ label: "Target (optional)", placeholder: "us", field: "target" },
		],
	},
	sprites: {
		name: "Sprites",
		tagline:
			"Linux sandboxes with persistent files, automatic idle sleep, wake on use, and checkpoints.",
		keyLabel: "Sprites token",
		keyPlaceholder: "Your Sprites API token",
		keyHint: "Get one at sprites.dev/account",
	},
	e2b: {
		name: "E2B Sandbox",
		tagline:
			"Linux sandboxes with pause and resume, filesystem and memory snapshots, and per-port URLs.",
		keyLabel: "E2B API key",
		keyPlaceholder: "e2b_...",
		keyHint: "Get one at e2b.dev/dashboard",
	},
	vercel: {
		name: "Vercel Sandbox",
		tagline:
			"Linux microVMs that save filesystem snapshots on stop. Resume the saved workspace; running processes must restart.",
		keyLabel: "Vercel access token",
		keyPlaceholder: "token…",
		keyHint: "Use a Vercel access token with its Team ID and Project ID, or credentials already configured for your account.",
		secondaryFields: [
			{ label: "Team ID", placeholder: "team_…", field: "teamId" },
			{ label: "Project ID", placeholder: "prj_…", field: "projectId" },
		],
	},
};

const COMPARISON_ROWS: ReadonlyArray<{
	label: string;
	daytona: string;
	e2b: string;
	sprites: string;
	vercel: string;
}> = [
	{ label: "Type", daytona: "Persistent sandbox", e2b: "Pausable sandbox", sprites: "Persistent sandbox", vercel: "Persistent microVM" },
	{ label: "Environment", daytona: "Linux", e2b: "Linux", sprites: "Linux", vercel: "Linux" },
	{ label: "Sleep / wake", daytona: "Stop / start; files retained", e2b: "Pause / resume", sprites: "Automatic idle suspension", vercel: "Snapshot / resume" },
	{ label: "First launch", daytona: "Includes runtime setup", e2b: "Includes runtime setup", sprites: "Includes runtime setup", vercel: "Includes runtime setup" },
	{ label: "Storage", daytona: "Persistent disk", e2b: "Retained across pause", sprites: "Persistent filesystem", vercel: "Filesystem snapshots" },
	{ label: "Workspace URLs", daytona: "Preview tunnels", e2b: "Per-port host", sprites: "Per-sprite URL", vercel: "Per-port URL" },
	{ label: "Snapshots", daytona: "Not exposed", e2b: "Filesystem and memory", sprites: "Checkpoints", vercel: "Filesystem only" },
	{ label: "Limits", daytona: "Account-dependent", e2b: "Plan-dependent", sprites: "Account-dependent", vercel: "Plan-dependent" },
	{ label: "Credentials", daytona: "API key", e2b: "API key", sprites: "API token", vercel: "Token, team, and project" },
];

const AGENT_DESC: Record<
	AgentKind,
	{
		name: string;
		mark: "nous" | "openclaw" | "claudecode" | "codex";
		tagline: string;
		bullets: string[];
		links: ReadonlyArray<{ label: string; href: string }>;
	}
> = {
	hermes: {
		name: "Hermes",
		mark: "nous",
		tagline: "Research and ongoing tasks with saved context.",
		bullets: [
			"Keeps memory files in the Worker's home directory",
			"Saves conversation history for inspection in Sessions",
			"Recurring work starts only after you configure and enable a schedule",
		],
		links: [
			{ label: "Source", href: "https://github.com/NousResearch/hermes-agent" },
			{ label: "Documentation", href: "https://hermes-agent.nousresearch.com/docs/" },
		],
	},
	openclaw: {
		name: "OpenClaw",
		mark: "openclaw",
		tagline: "Browser and shell tasks with saved context.",
		bullets: [
			"Keeps runtime state in .openclaw under the Worker's home directory",
			"Uses browser tools when installed and configured",
			"Runs from the Console or terminal; its optional HTTP gateway is separate",
		],
		links: [
			{ label: "Source", href: "https://github.com/openclaw/openclaw" },
		],
	},
	"claude-code": {
		name: "Claude Code",
		mark: "claudecode",
		tagline: "Edit, debug, and test with Claude Code.",
		bullets: [
			"Uses the native Claude Code CLI in your Worker's workspace",
			"Run tasks from the Console or work in an interactive terminal",
			"API-key setup supports automated runs; terminal sign-in is a separate step",
		],
		links: [
			{ label: "Source", href: "https://github.com/anthropics/claude-code" },
			{ label: "Documentation", href: "https://code.claude.com/docs/" },
		],
	},
	codex: {
		name: "Codex CLI",
		mark: "codex",
		tagline: "Write code and run tests with Codex.",
		bullets: [
			"Uses the native Codex CLI in your Worker's workspace",
			"Run tasks from the Console or work in an interactive terminal",
			"Keeps native session history for inspection in Sessions",
		],
		links: [
			{ label: "Source", href: "https://github.com/openai/codex" },
			{ label: "Documentation", href: "https://developers.openai.com/codex/" },
		],
	},
};

export function OnboardingFlow({ initialConfig, presets, initialPresetId, embedded = false }: Props) {
	const initialPreset = resolveSelectedPreset(presets, initialPresetId);
	const [step, setStep] = useState<Step>("welcome");
	const stepContentRef = useRef<HTMLDivElement | null>(null);
	const previousStepRef = useRef<Step>(step);
	const [agent, setAgent] = useState<AgentKind>(
		initialPreset?.agentKind ?? initialConfig.draftAgentKind ?? "hermes",
	);
	const [provider, setProvider] = useState<ProviderKind>(
		initialConfig.draftProviderKind && PROVIDER_KINDS.includes(initialConfig.draftProviderKind)
			? initialConfig.draftProviderKind
			: "daytona",
	);
	const [routerId, setRouterId] = useState<string>(DEFAULT_ROUTER_ID);
	const [model, setModel] = useState("");
	const wizardAiConfigured = useMemo(() => {
		const ai = (initialConfig.aiProviders ?? {}) as Record<string, { configured?: boolean }>;
		const conf: Record<string, boolean> = {};
		for (const k of Object.keys(ai)) conf[k] = Boolean(ai[k]?.configured);
		return conf;
	}, [initialConfig]);
	// Default to the first curated preset (the "core starter"); NO_PRESET = blank.
	const [presetId, setPresetId] = useState<string>(initialPreset?.id ?? presets[0]?.id ?? NO_PRESET);
	const selectedPreset = useMemo(
		() => presets.find((p) => p.id === presetId) ?? null,
		[presets, presetId],
	);
	const [providerKey, setProviderKey] = useState("");
	const [aiField, setAiField] = useState<OnboardingAiKeyField>(
		(["vercelAiGateway", "openrouter", "anthropic", "openai"] as const)
			.find((field) => initialConfig.aiProviders[field].configured) ?? "openai",
	);
	const [aiKeys, setAiKeys] = useState<OnboardingAiKeys>({
		vercelAiGateway: "",
		openrouter: "",
		anthropic: "",
		openai: "",
	});
	const [providerSecondary, setProviderSecondary] = useState<
		Record<string, string>
	>({});
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Boot state
	const [bootMachineId, setBootMachineId] = useState<string | null>(null);
	const [bootPhase, setBootPhase] = useState<string | null>(null);
	const [bootDone, setBootDone] = useState(false);
	const launchRef = useRef<(OnboardingLaunch & { intent: string }) | null>(null);
	const launchingRef = useRef(false);

	const hasKey = initialConfig.providers[provider].configured;

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

	const provision = useCallback(async () => {
		if (launchingRef.current) return;
		launchingRef.current = true;
		setBusy(true);
		setError(null);
		try {
			// Build provider-specific credentials payload.
			const setupBody: Record<string, unknown> = {
				draftAgentKind: agent,
				draftProviderKind: provider,
			};
			if (providerKey.trim() || (provider === "daytona" && Object.values(providerSecondary).some((value) => value.trim()))) {
				const cred: Record<string, unknown> =
					provider === "vercel"
						? { token: providerKey.trim() }
						: { apiKey: providerKey.trim() };
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
			if (aiKeys.vercelAiGateway.trim()) {
				aiProviderKeys.vercelAiGateway = aiKeys.vercelAiGateway.trim();
			}
			if (aiKeys.openrouter.trim()) aiProviderKeys.openrouter = aiKeys.openrouter.trim();
			if (aiKeys.anthropic.trim()) aiProviderKeys.anthropic = aiKeys.anthropic.trim();
			if (aiKeys.openai.trim()) aiProviderKeys.openai = aiKeys.openai.trim();
			if (Object.keys(aiProviderKeys).length > 0) {
				setupBody.aiProviderKeys = aiProviderKeys;
			}
			const intent = JSON.stringify({ agent, presetId, provider, routerId, model });
			if (!launchRef.current || launchRef.current.intent !== intent) {
				launchRef.current = { workerId: crypto.randomUUID(), operationId: null, intent };
				setBootMachineId(null);
			}
			setBootPhase("pending");
			const operationId = await submitOnboardingLaunch(launchRef.current, {
				setup: setupBody,
				presetId: presetId === NO_PRESET ? null : presetId,
				agentKind: agent,
				providerKind: provider,
				gatewayProfileId: agentUsesRouter(agent) && routerId ? routerId : DEFAULT_ROUTER_ID,
				model,
			});
			const completed = await waitForControlPlaneOperation(operationId, {
				onUpdate: (view) => {
					if (view.machineId) setBootMachineId(view.machineId);
					if (view.worker?.status?.phase) setBootPhase(view.worker.status.phase);
				},
			});
			if (!completed.machineId) throw new Error("launch completed without a machine id");
			setBootMachineId(completed.machineId);
			setBootPhase("running");
			setBootDone(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : "provision failed");
		} finally {
			launchingRef.current = false;
			setBusy(false);
		}
	}, [agent, aiKeys, presetId, provider, providerKey, providerSecondary, routerId, model]);

	const agentCredDraft: DraftAiKeys = {
		vercelAiGateway: aiKeys.vercelAiGateway,
		openrouter: aiKeys.openrouter,
		anthropic: aiKeys.anthropic,
		openai: aiKeys.openai,
	};
	const agentCredsOk = canBootstrapAgent(
		agent,
		{ providers: initialConfig.providers, aiProviders: initialConfig.aiProviders },
		agentCredDraft,
	);
	const canProvisionInfra = onboardingProviderReady(provider, hasKey, providerKey, providerSecondary);
	const canProvision = canProvisionInfra && agentCredsOk;

	// Live upstream readiness for the info panel — merges on-file keys with what
	// the user is typing this step, so the status flips to "ready" as they fill in.
	const effectiveAiConfigured: Record<string, boolean> = {
		...wizardAiConfigured,
		vercelAiGateway:
			wizardAiConfigured.vercelAiGateway ||
			aiKeys.vercelAiGateway.trim().length > 0,
		openrouter:
			wizardAiConfigured.openrouter || aiKeys.openrouter.trim().length > 0,
		anthropic: wizardAiConfigured.anthropic || aiKeys.anthropic.trim().length > 0,
		openai: wizardAiConfigured.openai || aiKeys.openai.trim().length > 0,
	};
	const agentReadiness = agentUpstreamReadiness(agent, routerId, effectiveAiConfigured);

	// A new step starts at its heading, including when the last button was below
	// the fold. Initial entry and edits within the same step keep their focus.
	useEffect(() => {
		if (previousStepRef.current === step) return;
		previousStepRef.current = step;
		const heading = stepContentRef.current?.querySelector<HTMLHeadingElement>("[data-onboarding-step-heading]");
		heading?.focus({ preventScroll: true });
		heading?.scrollIntoView({ behavior: "instant", block: "start" });
	}, [step]);

	function handleStartBoot() {
		if (!canProvision || busy) return;
		setStep("boot");
		void provision();
	}
	const Container = embedded ? "div" : "main";
	const headingLevel: StepHeadingLevel = embedded ? 2 : 1;

	return (
		<Container className={cn("dashboard-workspace min-w-0 bg-[var(--ret-bg)] text-[var(--ret-text)]", !embedded && "min-h-[100dvh]")}>
			{!embedded ? <header className={cn("h-16 border-b border-[var(--ret-border)] px-5 sm:px-8")}>
				<div className={cn("mx-auto flex h-full max-w-[var(--ret-content-max)] items-center justify-between gap-3")}>
					<a href="/" className={cn("group flex min-w-0 items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]")}>
						<BrandMark size={20} gap="tight" withLabel={false} />
						<span
							className={cn("truncate text-[18px] leading-none tracking-tight text-[var(--ret-text)] group-hover:text-[var(--ret-purple)]")}
							style={{ fontFamily: "var(--font-display-serif)" }}
						>
							agent-machines
						</span>
					</a>
					<div className={cn("flex shrink-0 items-center gap-3")}>
						<ThemeToggle />
						<a
							href="/dashboard"
							className={cn("flex min-h-9 items-center gap-1.5 text-sm text-[var(--ret-text-muted)] outline-none hover:text-[var(--ret-text)] focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]")}
						>
							Back to dashboard <ArrowRight size={16} aria-hidden="true" />
					</a>
					</div>
				</div>
			</header> : null}

			<div className={cn(embedded ? "min-w-0 max-w-[1040px]" : "mx-auto max-w-[1040px] px-5 py-8 sm:px-8 sm:py-12")}>
				<section aria-label="Agent setup quickstart" className={cn("min-w-0")}>
					<StepRail step={step} />

					{error && step !== "boot" ? (
					<ReticleFrame className={cn("mt-4 border-[var(--ret-red)]/50 bg-[var(--ret-red)]/5 p-3")}>
						<p role="alert" className={cn("text-[14px] text-[var(--ret-red)]")}>
							{error}
						</p>
					</ReticleFrame>
					) : null}

					<div ref={stepContentRef} className={cn("mt-8")}>
						{step === "welcome" ? <WelcomeStep headingLevel={headingLevel} onNext={next} /> : null}
						{step === "connect" ? (
							<KeyStep
								headingLevel={headingLevel}
								connectOnly
								aiField={aiField}
								onAiFieldChange={setAiField}
								selectionOptions={<div className={cn("grid gap-6 rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-5 sm:p-6")}>
									<AgentStep compact value={agent} onPick={(kind) => { setAgent(kind); setModel(""); }} onNext={next} />
									<ProviderPickStep compact value={provider} configured={initialConfig.providers} onPick={(kind) => {
										setProvider(kind); setProviderKey(""); setProviderSecondary({});
									}} onBack={back} onNext={next} />
								</div>}
								agent={agent}
								provider={provider}
								config={initialConfig}
								readiness={agentReadiness}
								substrateReady={canProvisionInfra}
								hasKey={hasKey}
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
								onProvision={() => { if (canProvision) next(); }}
							/>
						) : null}
						{step === "configure" ? (
							<PresetStep headingLevel={headingLevel} compact presets={presets} selectedId={presetId} onPick={setPresetId} onBack={back}
								onNext={handleStartBoot} canContinue={canProvision && !busy} continueLabel="Launch workspace"
								launchOptions={<>
									<dl className={cn("grid grid-cols-2 gap-5 rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-5")}>
										<div><dt className={cn("text-sm text-[var(--ret-text-muted)]")}>Runtime</dt><dd className={cn("mt-1 flex items-center gap-2 text-base font-medium")}><Logo mark={AGENT_DESC[agent].mark} size={20} />{AGENT_LABEL[agent]}</dd></div>
										<div><dt className={cn("text-sm text-[var(--ret-text-muted)]")}>Compute</dt><dd className={cn("mt-1 flex items-center gap-2 text-base font-medium")}><Logo mark={providerLogoMark(provider)} size={20} />{PROVIDER_LABEL[provider]}</dd></div>
									</dl>
									<details className={cn("rounded-lg border border-[var(--ret-border)] p-5")}>
										<summary className={cn("cursor-pointer text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]")}>Model and routing options</summary>
										<div className={cn("mt-5 grid gap-5")}>
											{agentUsesRouter(agent) ? <RouterSelect agentKind={agent} value={routerId} onChange={setRouterId} aiConfigured={effectiveAiConfigured} /> : null}
											<label htmlFor="onboarding-model" className={cn("text-sm font-medium")}>Model (optional)</label>
											<input id="onboarding-model" value={model} onChange={(event) => setModel(event.target.value)} placeholder="Runtime default" maxLength={200} aria-describedby="onboarding-model-help" className={cn("min-h-11 w-full rounded-md border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 text-base outline-none focus:border-[var(--ret-purple)]")} />
											<p id="onboarding-model-help" className={cn("text-sm leading-relaxed text-[var(--ret-text-muted)]")}>{agentUsesRouter(agent) ? "Leave blank for a supported model on your connection. Google and custom endpoints need their exact model ID." : `Hosted ${AGENT_LABEL[agent]} requires a native ${agent === "codex" ? "OpenAI" : "Anthropic"} key and compatible model. Leave blank for its default model.`}</p>
										</div>
									</details>
									<p className={cn("flex items-start gap-2 text-sm leading-relaxed text-[var(--ret-text-muted)]")}><ShieldCheck size={20} aria-hidden="true" className={cn("shrink-0")} />Launch saves your credentials and configuration before requesting a cloud workspace. These changes can remain saved if launch fails. Compute and model providers bill you directly. Stop or destroy unused workspaces from Machines.</p>
								</>}
							/>
						) : null}
						{step === "boot" ? (
							<BootStep
								headingLevel={headingLevel}
								agent={agent}
								provider={provider}
								machineId={bootMachineId}
								phase={bootPhase}
								done={bootDone}
								busy={busy}
								onRetry={() => void provision()}
								onBack={() => { setError(null); setStep("connect"); }}
								error={error}
							/>
						) : null}
					</div>
				</section>

				{step === "configure" ? <details className={cn("mt-6 rounded-lg border border-[var(--ret-border)]")}><summary className={cn("cursor-pointer px-5 py-4 text-sm text-[var(--ret-text-muted)]")}>Inspect selected tools and memory</summary><RigPreview headingLevel={embedded ? 3 : 2} agent={agent} provider={provider} preset={selectedPreset} bootPhase={null} bootDone={false} /></details> : null}
			</div>
		</Container>
	);
}

function StepRail({ step }: { step: Step }) {
	const order = STEPS.map((s) => s.id);
	const i = order.indexOf(step);
	return (
		<ol aria-label="Setup progress" className={cn("grid grid-cols-4 gap-2 border-b border-[var(--ret-border)] pb-5")}>
			{STEPS.map((s, idx) => {
				const isActive = idx === i;
				const isDone = idx < i;
				return (
					<li
						key={s.id}
						aria-current={isActive ? "step" : undefined}
						title={s.hint}
						className={cn(
							"flex min-w-0 flex-col items-center gap-2 py-2 text-center sm:flex-row sm:text-left",
							isActive
								? "text-[var(--ret-purple)]"
								: isDone
									? "text-[var(--ret-text)]"
									: "text-[var(--ret-text-muted)]",
						)}
					>
						<span
							className={cn(
								"flex h-7 w-7 shrink-0 items-center justify-center border text-[13px] tabular-nums",
								isDone
									? "border-[var(--ret-green)]/40 bg-[var(--ret-green)]/10 text-[var(--ret-green)]"
									: isActive
										? "border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
										: "border-[var(--ret-border)] text-[var(--ret-text-muted)]",
							)}
						>
							{isDone ? <><Check size={16} aria-hidden="true" /><span className={cn("sr-only")}>Completed</span></> : idx + 1}
						</span>
						<span className={cn("min-w-0")}>
							<p className={cn("text-[13px] font-medium sm:text-sm")}>
								{s.label}
							</p>
							<p className={cn("sr-only")}>
								{s.hint}
							</p>
						</span>
					</li>
				);
			})}
		</ol>
	);
}

function WelcomeStep({ onNext, headingLevel = 1 }: { onNext: () => void; headingLevel?: StepHeadingLevel }) {
	const Heading = headingLevel === 2 ? "h2" : "h1";
	const Subheading = headingLevel === 2 ? "h3" : "h2";
	return (
		<div className={cn("space-y-7")}>
			<div className={cn("max-w-[680px]")}>
				<Heading data-onboarding-step-heading tabIndex={-1} className={cn("scroll-mt-20 font-semibold leading-tight tracking-tight outline-none", headingLevel === 2 ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl")}>Build your first agent setup.</Heading>
				<p className={cn("mt-4 text-base leading-7 text-[var(--ret-text-muted)]")}>Connect your accounts, choose a starter, and open your agent’s workspace.</p>
			</div>
			<div className={cn("rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-5 sm:p-6")}>
				<Subheading className={cn("text-lg font-medium")}>Bring two things</Subheading>
				<ul className={cn("mt-5 grid gap-6 text-base md:grid-cols-2")}>
					<li className={cn("flex gap-3")}><KeyRound size={20} aria-hidden="true" className={cn("mt-1 shrink-0 text-[var(--ret-text-muted)]")} /><div>A compute account<p className={cn("mt-1 text-sm leading-6 text-[var(--ret-text-muted)]")}>Daytona, E2B, Sprites, or Vercel Sandbox. This is where your agent runs.</p></div></li>
					<li className={cn("flex gap-3")}><Brain size={20} aria-hidden="true" className={cn("mt-1 shrink-0 text-[var(--ret-text-muted)]")} /><div>A compatible model API key<p className={cn("mt-1 text-sm leading-6 text-[var(--ret-text-muted)]")}>We’ll show the keys supported by your runtime. A chat subscription is not an API key.</p></div></li>
				</ul>
				<p className={cn("mt-6 border-t border-[var(--ret-border)] pt-4 text-sm leading-6 text-[var(--ret-text-muted)]")}>Existing saved credentials can be reused. Nothing new is saved or provisioned by this quickstart until you choose Launch workspace. Your providers bill you directly; no credits are included.</p>
			</div>
			<div className={cn("flex flex-wrap items-center justify-between gap-4")}>
				<a href="/dashboard/components" className={cn("text-sm text-[var(--ret-text-muted)] underline-offset-4 hover:underline")}>Explore building blocks first</a>
				<ReticleButton variant="primary" size="md" onClick={onNext}>Connect accounts <ArrowRight size={18} aria-hidden="true" /></ReticleButton>
			</div>
			<QuickstartGuide />
		</div>
	);
}

function AgentStep({
	value,
	onPick,
	onNext,
	compact = false,
}: {
	value: AgentKind;
	onPick: (kind: AgentKind) => void;
	onNext: () => void;
	compact?: boolean;
}) {
	if (compact) return (
		<fieldset className={cn("min-w-0")}>
			<legend className={cn("mb-3 text-sm font-medium")}>Agent runtime</legend>
			<div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4")}>
				{(Object.keys(AGENT_DESC) as AgentKind[]).map((kind) => <button key={kind} type="button" aria-pressed={kind === value} onClick={() => onPick(kind)} className={cn("flex min-h-12 items-center justify-center gap-2 rounded-md border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]", kind === value ? "border-[var(--ret-text)] bg-[var(--ret-surface)]" : "border-[var(--ret-border)] hover:bg-[var(--ret-surface)]")}><Logo mark={AGENT_DESC[kind].mark} size={20} />{AGENT_DESC[kind].name}</button>)}
			</div>
			<p className={cn("mt-3 text-sm leading-6 text-[var(--ret-text-muted)]")}>{AGENT_DESC[value].tagline} {agentUsesRouter(value) ? "Choose one supported model connection below." : `Hosted ${AGENT_LABEL[value]} requires a native ${value === "codex" ? "OpenAI" : "Anthropic"} API key.`}</p>
		</fieldset>
	);
	return (
		<div className={cn("space-y-5")}>
			<div>
				<p className={cn("text-sm text-[var(--ret-text-muted)]")}>Step 1 · Runtime</p>
				<h1 tabIndex={-1} className={cn("ret-display mt-1 scroll-mt-6 text-[30px] leading-tight outline-none")}>
					Choose your agent runtime
				</h1>
				<p className={cn("mt-2 max-w-[60ch] text-base leading-relaxed text-[var(--ret-text-dim)]")}>
					Choose one of four agent runtimes for your setup. Next, select starting instructions, compute, and model credentials.
				</p>
				<details className={cn("mt-3 text-sm text-[var(--ret-text-muted)]")}>
					<summary className={cn("w-fit cursor-pointer outline-none hover:text-[var(--ret-text)] focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]")}>How the runtimes work</summary>
					<p className={cn("mt-2 max-w-[65ch] leading-relaxed")}>Claude Code and Codex use their
					native CLIs; tools and HTTP support differ by runtime. No agent HTTP
					gateway is required to use the Console. Memory and runtime files live
					in your Worker&rsquo;s home directory, whose path depends on the provider.
					</p>
				</details>
			</div>
			<div className={cn("grid gap-3 md:grid-cols-2")}>
				{(Object.keys(AGENT_DESC) as AgentKind[]).map((kind) => {
					const meta = AGENT_DESC[kind];
					const selected = value === kind;
					return (
						<div
							key={kind}
							className={cn(
								"flex min-w-0 flex-col border",
								selected
									? "border-[var(--ret-purple)] bg-[var(--ret-purple-glow)]"
									: "border-[var(--ret-border)] bg-[var(--ret-bg)] hover:border-[var(--ret-border-hover)]",
							)}
						>
							<button
								type="button"
								aria-pressed={selected}
								onClick={() => onPick(kind)}
								className={cn("group flex flex-1 flex-col gap-3 p-5 text-left outline-none active:bg-[var(--ret-surface)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ret-purple)]")}
							>
								<div className={cn("flex items-center justify-between gap-2")}>
									<div className={cn("flex items-center gap-2")}>
										<Logo mark={meta.mark} size={28} />
										<h2 className={cn("text-[18px] font-medium text-[var(--ret-text)]")}>
											{meta.name}
										</h2>
									</div>
									{selected ? (
										<CheckCircle2 size={20} aria-hidden="true" className={cn("shrink-0 text-[var(--ret-purple)]")} />
									) : null}
								</div>
								<p className={cn("text-base leading-relaxed text-[var(--ret-text-dim)]")}>
									{meta.tagline}
								</p>
							</button>
							<details className={cn("border-t border-[var(--ret-border)] px-5 py-3 text-sm text-[var(--ret-text-muted)]")}>
								<summary className={cn("cursor-pointer outline-none hover:text-[var(--ret-text)] focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]")}>{meta.name} details</summary>
								<ul className={cn("mt-3 list-disc space-y-2 pl-4 text-sm leading-relaxed text-[var(--ret-text-muted)]")}>
									{meta.bullets.map((b) => (
										<li key={b}>{b}</li>
									))}
								</ul>
							{/* Source links sit OUTSIDE the picker button so clicking
							    them opens the link instead of selecting the agent. */}
							<div className={cn("mt-3 flex flex-wrap gap-x-4 gap-y-2")}>
								{meta.links.map((l) => (
									<a
										key={l.href}
										href={l.href}
										target="_blank"
										rel="noreferrer"
										className={cn("text-[14px] text-[var(--ret-text-muted)] motion-safe:transition-[color,background-color,border-color] motion-safe:duration-150 motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:transition-none hover:text-[var(--ret-purple)]")}
									>
									{l.label} <ArrowUpRight size={14} aria-hidden="true" className={cn("inline")} />
								</a>
								))}
							</div>
							</details>
						</div>
					);
				})}
			</div>
			<div className={cn("flex justify-end")}>
				<ReticleButton variant="primary" size="md" onClick={onNext}>
					Continue <ArrowRight size={18} aria-hidden="true" />
				</ReticleButton>
			</div>
		</div>
	);
}

function PresetBrand({ brand, size }: { brand?: string; size: number }) {
	if (!brand) return null;
	if (isMark(brand)) return <Logo mark={brand} size={size} />;
	if (isServiceSlug(brand)) return <ServiceIcon slug={brand} size={size} />;
	return null;
}

function PresetStep({
	headingLevel = 1,
	presets,
	selectedId,
	onPick,
	onBack,
	onNext,
	compact = false,
	launchOptions,
	canContinue = true,
	continueLabel = "Continue",
}: {
	headingLevel?: StepHeadingLevel;
	presets: Preset[];
	selectedId: string;
	onPick: (id: string) => void;
	onBack: () => void;
	onNext: () => void;
	compact?: boolean;
	launchOptions?: ReactNode;
	canContinue?: boolean;
	continueLabel?: string;
}) {
	const Heading = headingLevel === 2 ? "h2" : "h1";
	const selected = presets.find((preset) => preset.id === selectedId);
	return (
		<div className={cn("space-y-5")}>
			<div>
				<Heading data-onboarding-step-heading tabIndex={-1} className={cn("scroll-mt-20 text-3xl font-semibold leading-tight tracking-tight outline-none")}>Choose a starting configuration</Heading>
				<p className={cn("mt-2 max-w-[60ch] text-base leading-relaxed text-[var(--ret-text-dim)]")}>
					Choose a template with instructions and tools, or start blank.
				</p>
				<p className={cn("mt-3 max-w-[65ch] text-sm leading-relaxed text-[var(--ret-text-muted)]")}>
					Connected tools may still need credentials or setup; selection is not verification.
					Recurring work runs only when you configure and enable a schedule.
				</p>
				<details className={cn("mt-3 text-sm text-[var(--ret-text-muted)]")}>
					<summary className={cn("w-fit cursor-pointer outline-none hover:text-[var(--ret-text)] focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]")}>What a preset includes</summary>
					<p className={cn("mt-2 max-w-[65ch] leading-relaxed")}>Edit instructions in Memory and review tools in Loadout after launch.</p>
				</details>
			</div>
			{compact ? <div className={cn("rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-5")}>
				<label htmlFor="quickstart-preset" className={cn("block text-sm font-medium")}>Starting instructions and tools</label>
				<select id="quickstart-preset" value={selectedId} onChange={(event) => onPick(event.target.value)} className={cn("mt-3 min-h-12 w-full rounded-md border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]")}>
					{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
					<option value={NO_PRESET}>Start blank</option>
				</select>
				<p className={cn("mt-4 text-sm leading-6 text-[var(--ret-text-muted)]")}>{selected?.description ?? "Basic instructions, with the bundled Registry catalog available when you want to add tools."}</p>
				{selected ? <p className={cn("mt-2 text-sm text-[var(--ret-text-muted)]")}>Skills: {selected.skillIds.filter((id) => id !== "*").length} · MCP servers: {selected.mcpServerIds.filter((id) => id !== "*").length}. Selected, not verified.</p> : null}
			</div> : <div className={cn("grid gap-3 md:grid-cols-2")}>
				{presets.map((preset) => {
					const selected = preset.id === selectedId;
					const skillCount = preset.skillIds.filter((id) => id !== "*").length;
					const mcpCount = preset.mcpServerIds.filter((id) => id !== "*").length;
					return (
						<button
							key={preset.id}
							type="button"
							aria-pressed={selected}
							onClick={() => onPick(preset.id)}
							className={cn(
								"flex min-w-0 flex-col gap-3 border p-5 text-left outline-none active:bg-[var(--ret-surface)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ret-purple)]",
								selected
									? "border-[var(--ret-purple)] bg-[var(--ret-purple-glow)]"
									: "border-[var(--ret-border)] bg-[var(--ret-bg)] hover:border-[var(--ret-border-hover)]",
							)}
						>
							<div className={cn("flex items-center justify-between gap-2")}>
								<div className={cn("flex min-w-0 items-center gap-2")}>
									<PresetBrand brand={preset.brand} size={28} />
									<h2 className={cn("text-[18px] font-medium text-[var(--ret-text)]")}>
										{preset.name}
									</h2>
								</div>
								{selected ? (
									<CheckCircle2 size={20} aria-hidden="true" className={cn("shrink-0 text-[var(--ret-purple)]")} />
								) : null}
							</div>
							<p className={cn("text-base leading-relaxed text-[var(--ret-text-dim)]")}>
								{preset.description}
							</p>
							<p className={cn("mt-auto text-[14px] text-[var(--ret-text-muted)]")}>
								Skills: {skillCount} · MCP servers: {mcpCount}
							</p>
						</button>
					);
				})}
				<button
					type="button"
					aria-pressed={selectedId === NO_PRESET}
					onClick={() => onPick(NO_PRESET)}
					className={cn(
						"flex min-w-0 flex-col gap-3 border p-5 text-left outline-none active:bg-[var(--ret-surface)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ret-purple)]",
						selectedId === NO_PRESET
							? "border-[var(--ret-purple)] bg-[var(--ret-purple-glow)]"
							: "border-dashed border-[var(--ret-border)] bg-[var(--ret-bg)] hover:border-[var(--ret-border-hover)]",
					)}
				>
					<div className={cn("flex items-center justify-between gap-2")}>
						<div className={cn("flex items-center gap-2")}><PackageOpen size={28} aria-hidden="true" className={cn("text-[var(--ret-purple)]")} /><h2 className={cn("text-[18px] font-medium text-[var(--ret-text)]")}>Start blank</h2></div>
						{selectedId === NO_PRESET ? (
							<CheckCircle2 size={20} aria-hidden="true" className={cn("shrink-0 text-[var(--ret-purple)]")} />
						) : null}
					</div>
					<p className={cn("text-base leading-relaxed text-[var(--ret-text-dim)]")}>
						No specialist preset selected. Start with basic instructions and
						choose your own tools from the bundled Registry catalog.
					</p>
					<p className={cn("mt-auto text-[14px] text-[var(--ret-text-muted)]")}>
						No specialist tools selected
					</p>
				</button>
			</div>}
			{launchOptions}
			<div className={cn("flex items-center justify-between gap-2 border-t border-[var(--ret-border)] pt-5")}>
				<ReticleButton variant="ghost" size="md" onClick={onBack}>
					<ArrowLeft size={18} aria-hidden="true" /> Back
				</ReticleButton>
				<ReticleButton variant="primary" size="md" onClick={onNext} disabled={!canContinue}>
					{continueLabel} <ArrowRight size={18} aria-hidden="true" />
				</ReticleButton>
			</div>
		</div>
	);
}

function ProviderComparison({ selected }: { selected: ProviderKind }) {
	const COLS: ReadonlyArray<{ key: keyof (typeof COMPARISON_ROWS)[number]; label: string }> = [
		{ key: "daytona", label: "Daytona" },
		{ key: "e2b", label: "E2B" },
		{ key: "sprites", label: "Sprites" },
		{ key: "vercel", label: "Vercel" },
	];

	return (
		<details className={cn("group/comparison min-w-0 border border-[var(--ret-border)]")}>
			<summary className={cn("flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-base font-medium outline-none hover:bg-[var(--ret-surface)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ret-purple)] [&::-webkit-details-marker]:hidden")}>
				Compare provider capabilities
				<ChevronDown size={20} aria-hidden="true" className={cn("shrink-0 text-[var(--ret-text-muted)] group-open/comparison:rotate-180")} />
			</summary>
			<div role="region" aria-label="Provider capability comparison" tabIndex={0} className={cn("overflow-x-auto border-t border-[var(--ret-border)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ret-purple)]")}>
				<table className={cn("w-full min-w-[720px] text-sm leading-relaxed")}>
					<caption className={cn("px-4 py-3 text-left text-sm text-[var(--ret-text-muted)]")}>Launch time and limits vary</caption>
					<thead>
						<tr className={cn("border-b border-[var(--ret-border)]")}>
							<th scope="col" className={cn("px-3 py-2 text-left text-[14px] font-medium text-[var(--ret-text-muted)]")}>
								Feature
							</th>
							{COLS.map((col) => (
								<th
									key={col.key}
									scope="col"
									className={cn(
										"px-3 py-2 text-left text-[14px] ",
										selected === col.key
											? "bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
											: "text-[var(--ret-text-muted)]",
									)}
								>
									<span className={cn("inline-flex items-center gap-1.5")}>
										<Logo mark={providerLogoMark(col.key as ProviderKind)} size={20} tone="auto" />
										{col.label}
									</span>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{COMPARISON_ROWS.map((row) => (
							<tr key={row.label} className={cn("border-b border-[var(--ret-border)] last:border-b-0")}>
								<th scope="row" className={cn("whitespace-nowrap px-3 py-3 text-left font-medium text-[var(--ret-text-muted)]")}>
									{row.label}
								</th>
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
										<span className={cn("text-[14px]")}>{row[col.key]}</span>
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</details>
	);
}

function ProviderPickStep({
	value,
	configured,
	onPick,
	onBack,
	onNext,
	compact = false,
}: {
	value: ProviderKind;
	configured: Record<ProviderKind, { configured: boolean; scopeHint?: string }>;
	onPick: (kind: ProviderKind) => void;
	onBack: () => void;
	onNext: () => void;
	compact?: boolean;
}) {
	if (compact) return (
		<fieldset className={cn("min-w-0 border-t border-[var(--ret-border)] pt-5")}>
			<legend className={cn("mb-3 text-sm font-medium")}>Compute provider</legend>
			<div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4")}>
				{PROVIDER_KINDS.map((kind) => <button key={kind} type="button" aria-pressed={kind === value} onClick={() => onPick(kind)} className={cn("flex min-h-12 items-center justify-center gap-2 rounded-md border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]", kind === value ? "border-[var(--ret-text)] bg-[var(--ret-surface)]" : "border-[var(--ret-border)] hover:bg-[var(--ret-surface)]")}><Logo mark={providerLogoMark(kind)} size={20} />{PROVIDER_LABEL[kind]}</button>)}
			</div>
			<p className={cn("mt-3 text-sm leading-6 text-[var(--ret-text-muted)]")}>{PROVIDERS_META[value].tagline}</p>
		</fieldset>
	);
	return (
		<div className={cn("space-y-5")}>
			<div>
				<p className={cn("text-sm text-[var(--ret-text-muted)]")}>Step 3 · Compute</p>
				<h1 tabIndex={-1} className={cn("ret-display mt-1 scroll-mt-6 text-[30px] leading-tight outline-none")}>
					Pick where it runs
				</h1>
				<p className={cn("mt-1 max-w-[60ch] text-base leading-relaxed text-[var(--ret-text-dim)]")}>
					Choose the compute provider that will host your configured workspace. Connect its
					account in the next step if needed. Storage, sleep, and recovery
					capabilities differ by provider. The first launch also installs and
					configures your chosen runtime.
				</p>
			</div>
			<div className={cn("grid gap-3 sm:grid-cols-2")}>
				{PROVIDER_KINDS.map((kind) => {
					const meta = PROVIDERS_META[kind];
					const selected = value === kind;
					const hasCreds = configured[kind].configured;
					return (
						<button
							key={kind}
							type="button"
							aria-pressed={selected}
							onClick={() => onPick(kind)}
							className={cn(
								"group flex min-w-0 flex-col gap-3 border p-5 text-left outline-none active:bg-[var(--ret-surface)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ret-purple)]",
								selected
									? "border-[var(--ret-purple)] bg-[var(--ret-purple-glow)]"
									: "border-[var(--ret-border)] bg-[var(--ret-bg)] hover:border-[var(--ret-border-hover)]",
							)}
						>
							<div className={cn("flex items-center justify-between gap-2")}>
								<div className={cn("flex items-center gap-2")}>
									<Logo mark={providerLogoMark(kind)} size={28} tone="auto" />
									<h2 className={cn("text-[18px] font-medium text-[var(--ret-text)]")}>
										{meta.name}
									</h2>
								</div>
								<div className={cn("flex items-center gap-1.5")}>
									{hasCreds ? (
										<ReticleBadge className={cn("text-[13px]")} variant="success">Key on file</ReticleBadge>
									) : null}
									{selected ? (
										<CheckCircle2 size={20} aria-hidden="true" className={cn("shrink-0 text-[var(--ret-purple)]")} />
									) : null}
								</div>
							</div>
							<p className={cn("text-base leading-relaxed text-[var(--ret-text-dim)]")}>
								{meta.tagline}
							</p>
						</button>
					);
				})}
			</div>
			<ProviderComparison selected={value} />
			<div className={cn("flex items-center justify-between gap-2")}>
				<ReticleButton variant="ghost" size="md" onClick={onBack}>
					<ArrowLeft size={18} aria-hidden="true" /> Back
				</ReticleButton>
				<ReticleButton variant="primary" size="md" onClick={onNext}>
					Continue <ArrowRight size={18} aria-hidden="true" />
				</ReticleButton>
			</div>
		</div>
	);
}

function KeyStep({
	headingLevel = 1,
	connectionOptions,
	selectionOptions,
	connectOnly = false,
	aiField,
	onAiFieldChange,
	agent,
	provider,
	config,
	readiness,
	substrateReady,
	hasKey,
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
	headingLevel?: StepHeadingLevel;
	connectionOptions?: ReactNode;
	selectionOptions?: ReactNode;
	connectOnly?: boolean;
	aiField?: OnboardingAiKeyField;
	onAiFieldChange?: (field: OnboardingAiKeyField) => void;
	agent: AgentKind;
	provider: ProviderKind;
	config: PublicUserConfig;
	readiness: AgentUpstreamReadiness;
	substrateReady: boolean;
	hasKey: boolean;
	value: string;
	onChange: (v: string) => void;
	aiKeys: OnboardingAiKeys;
	onAiKeyChange: (field: OnboardingAiKeyField, val: string) => void;
	agentCredsOk: boolean;
	secondary: Record<string, string>;
	onSecondaryChange: (field: string, val: string) => void;
	busy: boolean;
	canProvision: boolean;
	onBack: () => void;
	onProvision: () => void;
}) {
	const Heading = headingLevel === 2 ? "h2" : "h1";
	const meta = PROVIDERS_META[provider];
	const agentReqs = agentCredentialRequirements(agent);
	return (
		<div className={cn("space-y-5")}>
			<div>
				<Heading data-onboarding-step-heading tabIndex={-1} className={cn("scroll-mt-20 text-3xl font-semibold leading-tight tracking-tight outline-none")}>
					Connect your accounts
				</Heading>
				<p className={cn("mt-1 max-w-[60ch] text-base leading-relaxed text-[var(--ret-text-dim)]")}>
					Choose where your agent runs and how it reaches a model. Enter new keys or reuse keys on file. Your providers bill you directly for machine and model usage.
				</p>
			</div>
			{selectionOptions}
			<div className={cn("grid items-start gap-5", connectOnly && "md:grid-cols-2")}>
			<fieldset className={cn("min-w-0 space-y-4 rounded-lg border border-[var(--ret-border)] p-4 sm:p-5")}>
			<legend className={cn("flex items-center gap-2 px-2 text-[18px] font-medium")}><Logo mark={providerLogoMark(provider)} size={24} /> Cloud provider</legend>
			<p className={cn("text-sm leading-relaxed text-[var(--ret-text-muted)]")}>{meta.keyHint}</p>
			<label className={cn("flex flex-col gap-1.5")}>
				<span className={cn("text-[14px] text-[var(--ret-text-muted)]")}>
					{meta.keyLabel}
				</span>
				<input
					type="password"
					autoComplete="off"
					autoCapitalize="none"
					autoCorrect="off"
					spellCheck={false}
					placeholder={meta.keyPlaceholder}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className={cn("border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-3 text-base text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-none")}
				/>
				<span className={cn("text-[14px] text-[var(--ret-text-muted)]")}>
					{hasKey
						? "On file. Leave blank to keep the existing key."
						: "Required to create the machine."}
				</span>
			</label>
			{meta.secondaryFields?.map((f) => (
				<label key={f.field} className={cn("flex flex-col gap-1.5")}>
					<span className={cn("text-[14px] text-[var(--ret-text-muted)]")}>
						{f.label}
					</span>
					<input
						type="text"
						autoComplete="off"
						placeholder={f.placeholder}
						value={secondary[f.field] ?? ""}
						onChange={(e) => onSecondaryChange(f.field, e.target.value)}
						className={cn("border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-3 text-base text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-none")}
					/>
				</label>
			))}
			</fieldset>
			{agentReqs.length > 0 ? (
				<fieldset className={cn("min-w-0 space-y-4 rounded-lg border border-[var(--ret-border)] p-4 sm:p-5")}>
					<legend className={cn("flex items-center gap-2 px-2 text-[18px] font-medium")}><KeyRound size={24} aria-hidden="true" className={cn("text-[var(--ret-purple)]")} /> AI connection · {AGENT_LABEL[agent]}</legend>
					{agentUsesRouter(agent) ? (
						<>
							<p className={cn("text-sm leading-6 text-[var(--ret-text-muted)]")}>{aiField ? "One compatible model connection is enough. Saved keys remain available for routing." : "Add at least one AI provider key below. You do not need all four."}</p>
							{aiField && onAiFieldChange ? <label className={cn("flex flex-col gap-2 text-sm text-[var(--ret-text-muted)]")}>Key to add or replace
								<select value={aiField} onChange={(event) => onAiFieldChange(event.target.value as OnboardingAiKeyField)} className={cn("min-h-11 rounded-md border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 text-base text-[var(--ret-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]")}>
									{agentReqs.map((req) => <option key={req.field} value={req.field}>{req.label.replace(/ (API )?key.*$/, "")}</option>)}
								</select>
							</label> : null}
						</>
					) : null}
					{agentReqs.filter((req) => !aiField || !agentUsesRouter(agent) || req.field === aiField).map((req) => {
						const field = req.field as OnboardingAiKeyField;
						const onFile = config.aiProviders[field]?.configured ?? false;
						return (
							<label key={req.field} className={cn("flex flex-col gap-1.5")}>
								<span className={cn("text-[14px] text-[var(--ret-text-muted)]")}>
									{req.label}
									{req.required ? " *" : ""}
								</span>
								<input
									type="password"
									autoComplete="off"
									autoCapitalize="none"
									autoCorrect="off"
									spellCheck={false}
									placeholder={req.hint}
									value={aiKeys[field]}
									onChange={(e) => onAiKeyChange(field, e.target.value)}
									className={cn("border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-3 text-base text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-none")}
								/>
								<span className={cn("text-[14px] text-[var(--ret-text-muted)]")}>
										{onFile
										? "On file. Leave blank to keep."
										: req.required
											? "Required for automated setup."
											: "Optional if another supported AI connection is available."}
									{req.signupUrl ? (
										<>
											{" "}
											<a
												href={req.signupUrl}
												target="_blank"
												rel="noopener noreferrer"
												className={cn("text-[var(--ret-purple)] underline-offset-2 hover:underline")}
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
						<p className={cn("text-[14px] text-[var(--ret-text-muted)]")}>
							Subscription sign-in ({agent === "claude-code" ? "claude auth login" : "codex login"}) is
							interactive. This setup requires an API key; you can sign in separately in the terminal after launch.
						</p>
					) : null}
				</fieldset>
			) : null}
			</div>
			<div className={cn("grid gap-4")}>{connectionOptions}</div>
			{/* Readiness and provider-specific sizing warnings remain visible. */}
			<details className={cn("rounded-lg border border-[var(--ret-border)] p-4")}>
				<summary className={cn("cursor-pointer text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]")}>Compatibility and provider details</summary>
			<div className={cn("mt-4 grid gap-3 md:grid-cols-2")}>
				<AgentInfoPanel agentKind={agent} readiness={readiness} />
				<MachineInfoPanel provider={provider} configured={substrateReady} />
			</div>
			{connectOnly ? <ProviderComparison selected={provider} /> : null}
			</details>
			{!agentCredsOk ? (
				<p className={cn("text-[14px] text-[var(--ret-amber)]")}>
					Add a supported AI provider key above before launching {AGENT_LABEL[agent]}.
				</p>
			) : null}
			{provider === "vercel" && value.trim() && !substrateReady ? (
				<p className={cn("text-[14px] text-[var(--ret-amber)]")}>A Vercel access token needs both a Team ID and a Project ID before launch.</p>
			) : null}
			<p className={cn("flex items-start gap-2 text-sm leading-relaxed text-[var(--ret-text-muted)]")}><ShieldCheck size={18} aria-hidden="true" className={cn("mt-0.5 shrink-0")} />{connectOnly ? "New keys are sent when you choose Launch workspace, before provisioning. Blank fields preserve saved keys; key presence is not a provider validation." : "Launch saves these credentials before requesting a cloud workspace. Saved changes can remain if launch fails. Your providers bill you directly."}</p>
			<div className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ret-border)] pt-4")}>
				<ReticleButton variant="ghost" size="md" onClick={onBack} disabled={busy}>
					<ArrowLeft size={18} aria-hidden="true" /> Back
				</ReticleButton>
				<ReticleButton
					variant="primary"
					size="md"
					onClick={onProvision}
					disabled={busy || !canProvision}
				>
					{busy ? (
						<BrailleSpinner name="braille" label="Saving..." className={cn("text-sm")} />
					) : (
						<>{connectOnly ? "Continue to configuration" : "Launch workspace"} <ArrowRight size={18} aria-hidden="true" /></>
					)}
				</ReticleButton>
			</div>
		</div>
	);
}

function BootStep({
	headingLevel = 1,
	agent,
	provider,
	machineId,
	phase,
	done,
	busy,
	error,
	onRetry,
	onBack,
}: {
	headingLevel?: StepHeadingLevel;
	agent: AgentKind;
	provider: ProviderKind;
	machineId: string | null;
	phase: string | null;
	done: boolean;
	busy: boolean;
	error: string | null;
	onRetry: () => void;
	onBack: () => void;
}) {
	const Heading = headingLevel === 2 ? "h2" : "h1";
	const isCliAgent = agent === "claude-code" || agent === "codex";
	const machineReady = Boolean(machineId) || phase === "bootstrapping" || phase === "running" || done;
	const steps = [
		{ id: "create", label: "Save setup and queue launch", isDone: (phase !== null && phase !== "pending") || machineReady },
		{ id: "machine", label: `Create ${PROVIDER_LABEL[provider]} workspace`, isDone: machineReady },
		{ id: "agent", label: `Prepare memory and configure ${AGENT_LABEL[agent]}`, isDone: done },
		{ id: "ready", label: "Check runtime readiness", isDone: done },
	];
	return (
		<div className={cn("space-y-5")}>
			<div>
				<Heading data-onboarding-step-heading tabIndex={-1} className={cn("scroll-mt-20 text-3xl font-semibold leading-tight tracking-tight outline-none")}>
					{done ? "Your workspace is ready" : error ? "Launch needs attention" : "Launching your workspace"}
				</Heading>
				<p className={cn("mt-1 max-w-[60ch] text-base leading-relaxed text-[var(--ret-text-dim)]")}>
					{done
						? "Launch completed. Open the Console to run your first task, then inspect your configuration and selected tools."
						: isCliAgent
							? `Creating a ${PROVIDER_LABEL[provider]} machine, preparing your memory, and configuring the native ${AGENT_LABEL[agent]} CLI. Selected tools may need additional setup.`
							: `Creating a ${PROVIDER_LABEL[provider]} machine, preparing your memory, and connecting ${AGENT_LABEL[agent]} to your chosen AI provider. Selected tools may need additional setup.`}
				</p>
			</div>

			{error ? (
				<ReticleFrame className={cn("border-[var(--ret-red)]/50 bg-[var(--ret-red)]/5 p-3")}>
					<p role="alert" className={cn("break-words text-sm leading-relaxed text-[var(--ret-red)]")}>{error}</p>
					<p className={cn("mt-3 text-sm leading-6 text-[var(--ret-text-muted)]")}>A failed launch can still leave saved settings or created compute. Retry keeps the same setup identity. Check Machines before starting a separate setup.</p>
					<div className={cn("mt-2 flex gap-2")}>
						<ReticleButton variant="secondary" size="sm" onClick={onRetry} disabled={busy}>
							Retry
						</ReticleButton>
						<ReticleButton variant="ghost" size="sm" onClick={onBack} disabled={busy}>
							Edit setup
						</ReticleButton>
					</div>
				</ReticleFrame>
			) : null}

			<ReticleFrame>
				<ol className={cn("divide-y divide-[var(--ret-border)]")}>
					{steps.map((s, idx) => {
						const active = !s.isDone && (idx === 0 || steps[idx - 1].isDone);
						return (
							<li
								key={s.id}
								className={cn("flex items-center gap-3 px-4 py-2.5 text-[16px]")}
							>
								<span
									className={cn(
										"flex h-5 w-5 items-center justify-center border text-[14px]",
										s.isDone
											? "border-[var(--ret-green)]/40 bg-[var(--ret-green)]/10 text-[var(--ret-green)]"
											: active
												? "border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
												: "border-[var(--ret-border)] text-[var(--ret-text-muted)]",
									)}
								>
									{s.isDone ? <Check size={16} aria-label="Completed" /> : active && busy ? <BrailleSpinner /> : idx + 1}
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
									<span className={cn("text-[14px] text-[var(--ret-text-muted)]")}>
										{phase}
									</span>
								) : null}
							</li>
						);
					})}
				</ol>
			</ReticleFrame>

			{machineId ? (
				<p className={cn("break-all font-mono text-[13px] text-[var(--ret-text-muted)]")}>
					Machine ID ·{" "}
					<span className={cn("text-[var(--ret-text)]")}>{machineId}</span>
				</p>
			) : (
				<p className={cn("text-[14px] text-[var(--ret-text-muted)]")}>
					{busy ? <><BrailleSpinner /> Waiting for the machine to be created…</> : "No machine ID is available yet."}
				</p>
			)}

			{/*
			  Live transcript of every controlplane phase change + on-VM
			  log line we can pull. Replaces the old "this can take a
			  minute" silence with a real running commentary so the
			  operator can see exactly which step the machine is
			  blocked on (and which Daytona error code if it's failing).
			*/}
			{machineId ? <BootTranscript active={busy && !done} machineId={machineId} maxHeight={280} /> : null}
			{done && machineId ? <div className={cn("space-y-5")}>
				<div className={cn("flex flex-wrap gap-3")}>
					<ReticleButton as="a" href={onboardingWorkspaceUrl(machineId)} variant="primary" size="md">Open this workspace <ArrowRight size={18} aria-hidden="true" /></ReticleButton>
					<ReticleButton as="a" href="/dashboard/machines" variant="secondary" size="md">Manage compute</ReticleButton>
				</div>
				<p className={cn("text-sm leading-6 text-[var(--ret-text-muted)]")}>Start with “List the files in the current directory.” Check selected tools before using them. Use Machines to stop or destroy unused compute; saved files and running-process behavior vary by provider.</p>
				<QuickstartGuide />
			</div> : null}
		</div>
	);
}

function RigPreview({
	headingLevel = 2,
	agent,
	provider,
	preset,
	bootPhase,
	bootDone,
}: {
	headingLevel?: 2 | 3;
	agent: AgentKind;
	provider: ProviderKind;
	preset: Preset | null;
	bootPhase: string | null;
	bootDone: boolean;
}) {
	const Heading = headingLevel === 3 ? "h3" : "h2";
	const meta = AGENT_DESC[agent];
	const skillIds = (preset?.skillIds ?? []).filter((id) => id !== "*");
	const mcpIds = (preset?.mcpServerIds ?? []).filter((id) => id !== "*");
	const spotlight = skillIds.slice(0, 8);

	return (
		<div className={cn("space-y-5 px-4 py-6 sm:px-6 xl:sticky xl:top-0")}>
			<div className={cn("flex items-center justify-between gap-2")}>
				<Heading className={cn("text-xl font-medium tracking-tight")}>Your agent setup</Heading>
				{bootPhase ? (
					<ReticleBadge className={cn("text-[13px]")} variant={bootDone ? "success" : "warning"}>
						{bootDone ? "ready" : bootPhase}
					</ReticleBadge>
				) : null}
			</div>
			<ReticleFrame>
				<div className={cn("flex items-center gap-3 border-b border-[var(--ret-border)] px-4 py-3")}>
					<Logo mark={meta.mark} size={28} />
					<div>
						<p className={cn("text-lg font-medium text-[var(--ret-text)]")}>
							{meta.name}
						</p>
						<p className={cn("text-[14px] text-[var(--ret-text-muted)]")}>
							{meta.tagline}
						</p>
						<p className={cn("mt-2 flex items-center gap-2 text-sm text-[var(--ret-text-muted)]")}>
							<Logo mark={providerLogoMark(provider)} size={18} /> on {PROVIDER_LABEL[provider]}
						</p>
					</div>
				</div>
				<div className={cn("grid grid-cols-2 gap-px bg-[var(--ret-border)]")}>
					<Tally label="selected skills" value={skillIds.length} />
					<Tally label="selected MCP servers" value={mcpIds.length} />
				</div>
			</ReticleFrame>

			<ReticleFrame>
				<div className={cn("flex items-center gap-2 border-b border-[var(--ret-border)] px-4 py-2")}>
					<PresetBrand brand={preset?.brand} size={20} />
					<p className={cn("text-[14px] text-[var(--ret-text-muted)]")}>
						Memory preset
					</p>
				</div>
				<div className={cn("px-4 py-3")}>
					<p className={cn("text-lg font-medium text-[var(--ret-text)]")}>
						{preset ? preset.name : "Blank start"}
					</p>
					<p className={cn("mt-0.5 text-[14px] text-[var(--ret-text-dim)]")}>
						{preset
							? preset.description
							: "No specialist preset selected. The bundled Registry catalog remains available."}
					</p>
				</div>
			</ReticleFrame>

			{mcpIds.length > 0 ? (
				<details className={cn("border border-[var(--ret-border)] bg-[var(--ret-bg)]")}>
					<summary className={cn("cursor-pointer px-4 py-3 text-sm outline-none hover:bg-[var(--ret-surface)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ret-purple)]")}>
							Selected MCP servers · {mcpIds.length}
					</summary>
					<ul className={cn("divide-y divide-[var(--ret-border)]")}>
						{mcpIds.map((name) => (
							<li
								key={name}
								className={cn("break-all px-4 py-2 font-mono text-[13px] text-[var(--ret-text)]")}
							>
								{name}
							</li>
						))}
					</ul>
				</details>
			) : null}

			{spotlight.length > 0 ? (
				<details className={cn("border border-[var(--ret-border)] bg-[var(--ret-bg)]")}>
					<summary className={cn("cursor-pointer px-4 py-3 text-sm outline-none hover:bg-[var(--ret-surface)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ret-purple)]")}>
						Selected skill preview <span className={cn("ml-1 text-[13px] tabular-nums text-[var(--ret-text-muted)]")}>
							{spotlight.length} / {skillIds.length}
						</span>
					</summary>
					<ul className={cn("divide-y divide-[var(--ret-border)]")}>
						{spotlight.map((skillId) => (
							<li
								key={skillId}
								className={cn("break-all px-4 py-2 font-mono text-[13px] text-[var(--ret-text)]")}
							>
								{skillId}
							</li>
						))}
					</ul>
				</details>
			) : null}
		</div>
	);
}

function Tally({ label, value }: { label: string; value: number }) {
	return (
		<div className={cn("flex flex-col gap-0.5 bg-[var(--ret-bg)] px-3 py-2")}>
			<p className={cn("text-[13px] leading-relaxed text-[var(--ret-text-muted)] first-letter:uppercase")}>
				{label}
			</p>
			<p className={cn("text-xl tabular-nums text-[var(--ret-text)]")}>
				{value}
			</p>
		</div>
	);
}
