"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { Logo, type Mark } from "@/components/Logo";
import {
	ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, KeyRound, ListChecks,
	Rocket, Server, SlidersHorizontal, TriangleAlert, type IconComponent,
} from "@/components/ui/icons";
import { providerLogoMark } from "@/lib/fleet/logos";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { cn } from "@/lib/cn";
import { waitForControlPlaneOperation } from "@/lib/control-plane/client";
import {
	AGENT_KINDS,
	DEFAULT_MACHINE_SPEC,
	DEFAULT_MODEL,
	PROVIDER_KINDS,
	type AgentKind,
	type MachineSpec,
	type ProviderKind,
	type PublicUserConfig,
	type SetupStep,
} from "@/lib/user-config/schema";

type WizardDefaults = {
	machineSpec: MachineSpec;
	model: string;
	hasOwnerDaytonaKey: boolean;
	hasOwnerCursorKey: boolean;
	hasOwnerMachine: boolean;
};

type Props = {
	initialConfig: PublicUserConfig;
	defaults: WizardDefaults;
};

type StepDef = { id: SetupStep; label: string; hint: string; icon: IconComponent };

const STEPS: ReadonlyArray<StepDef> = [
	{ id: "api-key", label: "Credentials", hint: "Connect accounts", icon: KeyRound },
	{ id: "agent", label: "Agent", hint: "Choose a runtime", icon: Bot },
	{ id: "provider", label: "Provider", hint: "Choose a home", icon: Server },
	{ id: "spec", label: "Resources", hint: "Size and model", icon: SlidersHorizontal },
	{ id: "review", label: "Review", hint: "Confirm details", icon: ListChecks },
	{ id: "provisioned", label: "Ready", hint: "Open your Worker", icon: CheckCircle2 },
];

const AGENTS_DESC: Record<
	AgentKind,
	{ name: string; tagline: string; logo: Mark }
> = {
	hermes: {
		name: "Hermes",
		tagline:
			"Nous Research's agent, with memory, tools, and recurring work in a persistent workspace.",
		logo: "nous",
	},
	openclaw: {
		name: "OpenClaw",
		tagline:
			"A computer-use agent with a browser, shell, files, and visual tools on one machine.",
		logo: "openclaw",
	},
	"claude-code": {
		name: "Claude Code",
		tagline:
			"Anthropic's coding agent for understanding repositories, editing files, and using development tools.",
		logo: "claudecode",
	},
	codex: {
		name: "Codex",
		tagline:
			"OpenAI's coding agent for working with a project's files, commands, and development workflow.",
		logo: "codex",
	},
};

const PROVIDERS_DESC: Record<
	ProviderKind,
	{ name: string; tagline: string; ready: boolean; keyHint: string }
> = {
	daytona: {
		name: "Daytona",
		tagline:
			"Linux sandboxes with native terminals and private previews. Stop/start keeps the filesystem, not running processes.",
		ready: true,
		keyHint: "Daytona API key",
	},
	dedalus: { name: "Retired provider", tagline: "Unavailable for new Workers.", ready: false, keyHint: "Choose a supported provider." },
	sprites: {
		name: "Sprites",
		tagline:
			"Persistent Linux sandboxes with automatic idle sleep, wake on use, and checkpoints. Runs on Fly.io infrastructure.",
		ready: true,
		keyHint: "sprites-token",
	},
	e2b: {
		name: "E2B Sandbox",
		tagline:
			"Linux sandboxes with pause and resume, snapshots, and public preview URLs.",
		ready: true,
		keyHint: "e2b_...",
	},
	vercel: {
		name: "Vercel Sandbox",
		tagline:
			"Linux microVMs with filesystem snapshots on stop and per-port preview URLs. Resume restores files; processes restart.",
		ready: true,
		keyHint: "vercel token",
	},
};

const FIELD_INPUT = cn(
	"min-h-11 w-full rounded-sm border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2.5 font-mono text-base text-[var(--ret-text)]",
	"placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-2 focus:outline-offset-2 focus:outline-[var(--ret-purple)]",
);

const CHOICE_CARD = cn(
	"group relative flex h-full flex-col gap-4 rounded-sm border bg-[var(--ret-bg)] p-5 text-left",
	"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)]",
	"disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[var(--ret-bg)]",
);

const CHOICE_TAG = cn("inline-flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 text-sm leading-5");

export function SetupWizard({ initialConfig, defaults }: Props) {
	const router = useRouter();
	const [config, setConfig] = useState<PublicUserConfig>(initialConfig);
	const [activeStep, setActiveStep] = useState<SetupStep>(initialConfig.setupStep);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const completedSteps = useMemo(() => {
		const done = new Set<SetupStep>();
		const order = STEPS.map((s) => s.id);
		const idx = order.indexOf(config.setupStep);
		for (let i = 0; i < idx; i++) done.add(order[i]);
		if (config.setupStep === "provisioned") done.add("review");
		return done;
	}, [config.setupStep]);

	const submitPatch = useCallback(
		async (patch: Record<string, unknown>): Promise<boolean> => {
			setBusy(true);
			setError(null);
			try {
				const response = await fetch("/api/dashboard/admin/setup", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(patch),
				});
				const body = (await response.json()) as {
					config?: PublicUserConfig;
					message?: string;
				};
				if (!response.ok) {
					setError(body.message ?? `setup failed (HTTP ${response.status})`);
					return false;
				}
				if (body.config) setConfig(body.config);
				return true;
			} catch (err) {
				setError(err instanceof Error ? err.message : "network error");
				return false;
			} finally {
				setBusy(false);
			}
		},
		[],
	);

	const advanceTo = useCallback(
		async (next: SetupStep, extra: Record<string, unknown> = {}) => {
			const ok = await submitPatch({ ...extra, setupStep: next });
			if (ok) setActiveStep(next);
		},
		[submitPatch],
	);

	const provision = useCallback(async () => {
		setBusy(true);
		setError(null);
		try {
			const response = await fetch(
				"/api/dashboard/admin/provision-machine",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({}),
				},
			);
			const body = (await response.json()) as {
				ok?: boolean;
				machineId?: string;
				operation?: { id?: string };
				phase?: string;
				message?: string;
				error?: string;
			};
			if (!response.ok) {
				setError(body.message ?? `provision failed (HTTP ${response.status})`);
				return;
			}
			if (!body.operation?.id) {
				setError("provision failed: missing lifecycle operation");
				return;
			}
			await waitForControlPlaneOperation(body.operation.id);
			setActiveStep("provisioned");
			// Refresh config to pick up the new machine.
			const fresh = await fetch("/api/dashboard/admin/setup");
			if (fresh.ok) {
				const json = (await fresh.json()) as { config: PublicUserConfig };
				setConfig(json.config);
			}
			router.refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : "network error");
		} finally {
			setBusy(false);
		}
	}, [router]);

	return (
		<div className={cn("space-y-7 px-5 py-6 md:px-7")}>
			<StepRail
				active={activeStep}
				completed={completedSteps}
				onJump={(step) => setActiveStep(step)}
			/>

			{error ? (
				<div role="alert" className={cn("flex items-start gap-3 rounded-sm border border-[var(--ret-red)]/35 bg-[var(--ret-red)]/5 p-4 text-base leading-7 text-[var(--ret-red)]")}>
					<TriangleAlert className={cn("mt-1 h-5 w-5 shrink-0")} aria-hidden="true" />
					<p className={cn("min-w-0 break-words")}>{error}</p>
				</div>
			) : null}

			{activeStep === "api-key" ? (
				<CredentialsStep
					config={config}
					hasOwnerDaytonaKey={defaults.hasOwnerDaytonaKey}
					busy={busy}
					onSave={async (creds, cursorApiKey, aiProviderKeys) => {
						const patch: Record<string, unknown> = {
							setupStep: "agent",
							providerCredentials: creds,
						};
						if (cursorApiKey !== undefined) patch.cursorApiKey = cursorApiKey;
						if (aiProviderKeys !== undefined) patch.aiProviderKeys = aiProviderKeys;
						const ok = await submitPatch(patch);
						if (ok) setActiveStep("agent");
					}}
				/>
			) : null}

			{activeStep === "agent" ? (
				<AgentStep
					value={config.draftAgentKind}
					busy={busy}
					onSelect={async (agentKind) =>
						advanceTo("provider", { draftAgentKind: agentKind })
					}
				/>
			) : null}

			{activeStep === "provider" ? (
				<ProviderStep
					value={config.draftProviderKind}
					configured={config.providers}
					busy={busy}
					onSelect={async (providerKind) =>
						advanceTo("spec", { draftProviderKind: providerKind })
					}
				/>
			) : null}

			{activeStep === "spec" ? (
				<SpecStep
					value={config.draftSpec}
					defaults={defaults.machineSpec}
					model={config.draftModel}
					defaultModel={defaults.model}
					busy={busy}
					onSave={async (spec, model) =>
						advanceTo("review", { draftSpec: spec, draftModel: model })
					}
				/>
			) : null}

			{activeStep === "review" ? (
				<ReviewStep
					config={config}
					busy={busy}
					onProvision={provision}
					onBack={() => setActiveStep("spec")}
				/>
			) : null}

			{activeStep === "provisioned" ? (
				<ProvisionedStep
					config={config}
					onConfigure={() => setActiveStep("agent")}
					onChat={() => router.push("/dashboard/chat")}
					onMachines={() => router.push("/dashboard/machines")}
				/>
			) : null}
		</div>
	);
}

function StepRail({
	active,
	completed,
	onJump,
}: {
	active: SetupStep;
	completed: ReadonlySet<SetupStep>;
	onJump: (step: SetupStep) => void;
}) {
	return (
		<ol aria-label="Worker setup progress" className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6")}>
			{STEPS.map((step) => {
				const isActive = step.id === active;
				const isDone = completed.has(step.id);
				const reachable = isActive || isDone;
				return (
					<li key={step.id} className={cn("min-w-0")}>
						<button
							type="button"
							disabled={!reachable}
							aria-current={isActive ? "step" : undefined}
							className={cn(
								"flex h-full w-full items-start gap-2.5 rounded-sm border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)] disabled:cursor-not-allowed disabled:opacity-45",
								isActive ? "border-[var(--ret-purple)]/45 bg-[var(--ret-purple-glow)]" : "border-transparent",
								reachable && !isActive && "hover:bg-[var(--ret-surface)]",
							)}
							onClick={() => {
								if (reachable) onJump(step.id);
							}}
						>
							<span
								className={cn(
									"mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center",
									isDone
										? "text-[var(--ret-green)]"
										: isActive
											? "text-[var(--ret-purple)]"
											: "text-[var(--ret-text-muted)]",
								)}
							>
								{isDone ? <Check className={cn("h-5 w-5")} aria-hidden="true" /> : <step.icon className={cn("h-5 w-5")} aria-hidden="true" />}
							</span>
							<div className={cn("min-w-0")}>
								<p className={cn("text-sm font-semibold leading-6 text-[var(--ret-text)]")}>
									{step.label}
								</p>
								<p className={cn("text-sm leading-5 text-[var(--ret-text-muted)]")}>
									{step.hint}
								</p>
							</div>
						</button>
					</li>
				);
			})}
		</ol>
	);
}

function StepShell({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<ReticleFrame corners={false} className={cn("rounded-sm border-[var(--ret-border)]/60")}>
			<div className={cn("space-y-6 p-5 md:p-7")}>
				<header>
					<h2 className={cn("text-xl font-semibold tracking-tight text-[var(--ret-text)]")}>{title}</h2>
					<p className={cn("mt-2 max-w-[70ch] text-base leading-7 text-[var(--ret-text-dim)]")}>
						{description}
					</p>
				</header>
				{children}
			</div>
		</ReticleFrame>
	);
}

type CredsState = {
	daytona: string;
	daytonaApiUrl: string;
	daytonaTarget: string;
	sprites: string;
	e2b: string;
	vercelToken: string;
	vercelTeamId: string;
	vercelProjectId: string;
	cursor: string;
	vercelAiGateway: string;
	openrouter: string;
	anthropic: string;
	openai: string;
};

function CredentialsStep({
	config,
	hasOwnerDaytonaKey,
	busy,
	onSave,
}: {
	config: PublicUserConfig;
	hasOwnerDaytonaKey: boolean;
	busy: boolean;
	onSave: (
		creds: {
			daytona?: { apiKey: string; apiUrl?: string; target?: string };
			sprites?: { apiKey: string };
			e2b?: { apiKey: string };
			vercel?: { token: string; teamId: string; projectId: string };
		},
		cursorApiKey: string | undefined,
		aiProviderKeys: Record<string, string> | undefined,
	) => Promise<void>;
}) {
	const [state, setState] = useState<CredsState>({
		daytona: "",
		daytonaApiUrl: "",
		daytonaTarget: "",
		sprites: "",
		e2b: "",
		vercelToken: "",
		vercelTeamId: "",
		vercelProjectId: "",
		cursor: "",
		vercelAiGateway: "",
		openrouter: "",
		anthropic: "",
		openai: "",
	});

	const daytonaOnFile = config.providers.daytona.configured;
	const spritesOnFile = config.providers.sprites.configured;
	const e2bOnFile = config.providers.e2b.configured;
	const vercelOnFile = config.providers.vercel.configured;
	const cursorOnFile = config.hasCursorKey;
	const vercelAiGatewayOnFile = config.aiProviders.vercelAiGateway.configured;
	const openrouterOnFile = config.aiProviders.openrouter.configured;
	const anthropicOnFile = config.aiProviders.anthropic.configured;
	const openaiOnFile = config.aiProviders.openai.configured;
	const anyConfigured =
		daytonaOnFile || spritesOnFile || e2bOnFile || vercelOnFile || hasOwnerDaytonaKey ||
		vercelAiGatewayOnFile || openrouterOnFile || anthropicOnFile || openaiOnFile;

	function buildPatch() {
		const creds: Parameters<typeof onSave>[0] = {};
		if (state.daytona.trim() || state.daytonaApiUrl.trim() || state.daytonaTarget.trim()) {
			creds.daytona = { apiKey: state.daytona.trim(), apiUrl: state.daytonaApiUrl.trim() || undefined, target: state.daytonaTarget.trim() || undefined };
		}
		if (state.sprites.trim()) {
			creds.sprites = { apiKey: state.sprites.trim() };
		}
		if (state.e2b.trim()) {
			creds.e2b = { apiKey: state.e2b.trim() };
		}
		const vToken = state.vercelToken.trim();
		const vTeam = state.vercelTeamId.trim();
		const vProject = state.vercelProjectId.trim();
		if (vToken && vTeam && vProject) {
			creds.vercel = { token: vToken, teamId: vTeam, projectId: vProject };
		}
		const cursor = state.cursor.trim();
		const aiKeys: Record<string, string> = {};
		if (state.vercelAiGateway.trim()) {
			aiKeys.vercelAiGateway = state.vercelAiGateway.trim();
		}
		if (state.openrouter.trim()) aiKeys.openrouter = state.openrouter.trim();
		if (state.anthropic.trim()) aiKeys.anthropic = state.anthropic.trim();
		if (state.openai.trim()) aiKeys.openai = state.openai.trim();
		return {
			creds,
			cursor: cursor.length > 0 ? cursor : undefined,
			aiKeys: Object.keys(aiKeys).length > 0 ? aiKeys : undefined,
		};
	}

	return (
		<StepShell
			title="Connect your accounts"
			description="Provider keys create the machine; model keys power the agent. Saved keys stay in your private account settings. Leave a field blank to keep its existing value."
		>
			<h3 className={cn("flex items-center gap-2 text-lg font-semibold text-[var(--ret-text)]")}><Server className={cn("h-5 w-5 text-[var(--ret-text-muted)]")} aria-hidden="true" />Sandbox providers</h3>
			<div className={cn("grid gap-x-6 gap-y-5 lg:grid-cols-2")}>
				<KeyField
					label="Daytona API key"
					placeholder="Daytona API key"
					value={state.daytona}
					onChange={(v) => setState((s) => ({ ...s, daytona: v }))}
					hint={
						daytonaOnFile
							? "On file. Leave blank to keep."
							: hasOwnerDaytonaKey
								? "Owner default exists. Leave blank to inherit."
								: "Required for the Daytona provider."
					}
				/>
				<KeyField
					label="Daytona API URL (optional)"
					type="text"
					placeholder="https://app.daytona.io/api"
					value={state.daytonaApiUrl}
					onChange={(v) => setState((s) => ({ ...s, daytonaApiUrl: v }))}
					hint="Leave blank to use the configured endpoint or Daytona's default."
				/>
				<KeyField
					label="Daytona target (optional)"
					type="text"
					placeholder="us"
					value={state.daytonaTarget}
					onChange={(v) => setState((s) => ({ ...s, daytonaTarget: v }))}
					hint="Choose an available Daytona target, or leave blank for the configured default."
				/>
				<KeyField
					label="E2B API key"
					placeholder="e2b_..."
					value={state.e2b}
					onChange={(v) => setState((s) => ({ ...s, e2b: v }))}
					hint={
						e2bOnFile ? "On file. Leave blank to keep." : "Get one at e2b.dev/dashboard."
					}
				/>
				<KeyField
					label="Sprites token"
					placeholder="Sprites token"
					value={state.sprites}
					onChange={(v) => setState((s) => ({ ...s, sprites: v }))}
					hint={
						spritesOnFile ? "On file. Leave blank to keep." : "Get one at sprites.dev/account."
					}
				/>
				<KeyField
					label="Vercel access token"
					placeholder="vercel token"
					value={state.vercelToken}
					onChange={(v) => setState((s) => ({ ...s, vercelToken: v }))}
					hint={
						vercelOnFile
							? "On file. Leave blank to keep."
							: "Personal access token — or deploy on Vercel for OIDC."
					}
				/>
				<KeyField
					label="Vercel team ID"
					type="text"
					placeholder="team_..."
					value={state.vercelTeamId}
					onChange={(v) => setState((s) => ({ ...s, vercelTeamId: v }))}
					hint="Team settings → copy team ID. Required with token for local dev."
				/>
				<KeyField
					label="Vercel project ID"
					type="text"
					placeholder="prj_..."
					value={state.vercelProjectId}
					onChange={(v) => setState((s) => ({ ...s, vercelProjectId: v }))}
					hint="Project settings → copy project ID."
				/>
			</div>

			<h3 className={cn("flex items-center gap-2 border-t border-[var(--ret-border)]/50 pt-6 text-lg font-semibold text-[var(--ret-text)]")}><Bot className={cn("h-5 w-5 text-[var(--ret-text-muted)]")} aria-hidden="true" />Model providers</h3>
			<p className={cn("text-base leading-7 text-[var(--ret-text-dim)]")}>
				Hermes and OpenClaw use Vercel first. OpenRouter runs second. Claude Code needs Anthropic. Codex needs OpenAI.
			</p>
			<div className={cn("grid gap-x-6 gap-y-5 lg:grid-cols-2")}>
				<KeyField
					label="Vercel AI Gateway key"
					placeholder="vck_..."
					value={state.vercelAiGateway}
					onChange={(v) => setState((s) => ({ ...s, vercelAiGateway: v }))}
					hint={
						vercelAiGatewayOnFile
							? "On file. Leave blank to keep."
							: "Preferred for Hermes and OpenClaw."
					}
				/>
				<KeyField
					label="OpenRouter API key"
					placeholder="sk-or-..."
					value={state.openrouter}
					onChange={(v) => setState((s) => ({ ...s, openrouter: v }))}
					hint={
						openrouterOnFile
							? "On file. Leave blank to keep."
							: "Fallback for Hermes and OpenClaw."
					}
				/>
				<KeyField
					label="Anthropic API key"
					placeholder="sk-ant-..."
					value={state.anthropic}
					onChange={(v) => setState((s) => ({ ...s, anthropic: v }))}
					hint={
						anthropicOnFile
							? "On file. Leave blank to keep."
							: "For Claude Code, or Hermes/OpenClaw via Anthropic."
					}
				/>
				<KeyField
					label="OpenAI API key"
					placeholder="sk-..."
					value={state.openai}
					onChange={(v) => setState((s) => ({ ...s, openai: v }))}
					hint={
						openaiOnFile
							? "On file. Leave blank to keep."
							: "For Codex CLI, or Hermes/OpenClaw via OpenAI."
					}
				/>
			</div>

			<KeyField
				label="Cursor API key (optional)"
				placeholder="cursor-..."
				value={state.cursor}
				onChange={(v) => setState((s) => ({ ...s, cursor: v }))}
				hint={
					cursorOnFile
						? "On file. Leave blank to keep."
						: "Optional. Enables cursor-bridge MCP for code work."
				}
			/>
			<div className={cn("flex flex-wrap items-center justify-end gap-2")}>
				<ReticleButton
					variant="ghost"
					size="sm"
					onClick={() => onSave({}, undefined, undefined)}
					disabled={busy || !anyConfigured}
				>
					Use saved keys
				</ReticleButton>
				<ReticleButton
					variant="primary"
					size="sm"
					disabled={busy}
					onClick={() => {
						const { creds, cursor, aiKeys } = buildPatch();
						return onSave(creds, cursor, aiKeys);
					}}
				>
					{busy ? "Saving..." : "Save and continue"}
					<ArrowRight className={cn("h-4 w-4")} aria-hidden="true" />
				</ReticleButton>
			</div>
		</StepShell>
	);
}

function KeyField({
	type = "password",
	label,
	placeholder,
	value,
	onChange,
	hint,
	secondary,
}: {
	type?: "password" | "text";
	label: string;
	placeholder: string;
	value: string;
	onChange: (v: string) => void;
	hint: string;
	secondary?: {
		label: string;
		placeholder: string;
		value: string;
		onChange: (v: string) => void;
	};
}) {
	return (
		<div className={cn("flex flex-col gap-2")}>
			<label className={cn("flex flex-col gap-1.5")}>
				<span className={cn("text-sm text-[var(--ret-text-muted)] leading-6")}>
					{label}
				</span>
				<input
					type={type}
					autoComplete="off"
					autoCapitalize="none"
					autoCorrect="off"
					spellCheck={false}
					placeholder={placeholder}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className={FIELD_INPUT}
				/>
			<span className={cn("text-sm text-[var(--ret-text-muted)] leading-6")}>
				{hint}
			</span>
		</label>
		{secondary ? (
				<label className={cn("flex flex-col gap-1.5")}>
					<span className={cn("text-sm text-[var(--ret-text-muted)] leading-6")}>
						{secondary.label}
					</span>
					<input
						type="text"
						autoComplete="off"
						placeholder={secondary.placeholder}
						value={secondary.value}
						onChange={(e) => secondary.onChange(e.target.value)}
						className={FIELD_INPUT}
					/>
				</label>
			) : null}
		</div>
	);
}

function AgentStep({
	value,
	busy,
	onSelect,
}: {
	value: AgentKind;
	busy: boolean;
	onSelect: (kind: AgentKind) => Promise<void>;
}) {
	return (
		<StepShell
			title="Choose your agent"
			description="Choose the runtime your Worker will use. You can change it later from the Worker's controls."
		>
			<div className={cn("grid gap-4 md:grid-cols-2")}>
				{AGENT_KINDS.map((kind) => {
					const meta = AGENTS_DESC[kind];
					const selected = value === kind;
					return (
						<button
							key={kind}
							type="button"
							disabled={busy}
							aria-pressed={selected}
							onClick={() => void onSelect(kind)}
							className={cn(
								CHOICE_CARD,
								selected
									? "border-[var(--ret-purple)] bg-[var(--ret-purple-glow)]"
									: "border-[var(--ret-border)] hover:border-[var(--ret-border-hover)] hover:bg-[var(--ret-surface)]",
							)}
						>
							<div className={cn("flex flex-wrap items-center justify-between gap-3")}>
								<div className={cn("flex min-w-0 items-center gap-2")}>
									<Logo mark={meta.logo} size={28} tone="auto" />
									<h3 className={cn("text-lg text-[var(--ret-text)] font-semibold")}>
										{meta.name}
									</h3>
								</div>
								{selected ? (
									<span className={cn(CHOICE_TAG, "bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]")}><Check className={cn("h-3.5 w-3.5")} aria-hidden="true" />Selected</span>
								) : null}
							</div>
							<p className={cn("text-base leading-relaxed text-[var(--ret-text-dim)]")}>
								{meta.tagline}
							</p>
							<span className={cn("text-sm text-[var(--ret-text-muted)] leading-6")}>
								Runtime: {kind}
							</span>
						</button>
					);
				})}
			</div>
		</StepShell>
	);
}

function ProviderStep({
	value,
	configured,
	busy,
	onSelect,
}: {
	value: ProviderKind;
	configured: PublicUserConfig["providers"];
	busy: boolean;
	onSelect: (kind: ProviderKind) => Promise<void>;
}) {
	return (
		<StepShell
			title="Choose where it runs"
			description="Each provider has different pause, persistence, and preview capabilities. A saved key means one is on file—not that the provider has validated it."
		>
			<div className={cn("grid gap-4 md:grid-cols-2")}>
				{PROVIDER_KINDS.map((kind) => {
					const meta = PROVIDERS_DESC[kind];
					const selected = value === kind;
					const hasCreds = configured[kind].configured;
					return (
						<button
							key={kind}
							type="button"
							disabled={busy || !meta.ready}
							aria-pressed={selected}
							onClick={() => {
								if (meta.ready) void onSelect(kind);
							}}
							className={cn(
								CHOICE_CARD,
								selected
									? "border-[var(--ret-purple)] bg-[var(--ret-purple-glow)]"
									: "border-[var(--ret-border)] hover:border-[var(--ret-border-hover)]",
								!meta.ready && "cursor-not-allowed opacity-60 hover:border-[var(--ret-border)]",
							)}
						>
							<div className={cn("flex flex-wrap items-center justify-between gap-3")}>
								<div className={cn("flex min-w-0 items-center gap-2")}>
									<Logo mark={providerLogoMark(kind)} size={28} tone="auto" />
									<h3 className={cn("text-lg text-[var(--ret-text)] font-semibold")}>
										{meta.name}
									</h3>
								</div>
								{!meta.ready ? (
									<span className={cn(CHOICE_TAG, "text-[var(--ret-amber)]")}>Unavailable</span>
								) : selected ? (
									<span className={cn(CHOICE_TAG, "bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]")}><Check className={cn("h-3.5 w-3.5")} aria-hidden="true" />Selected</span>
								) : (
									<span className={cn(CHOICE_TAG, "text-[var(--ret-text-muted)]")}>Available</span>
								)}
							</div>
							<p className={cn("text-base leading-relaxed text-[var(--ret-text-dim)]")}>
								{meta.tagline}
							</p>
							<div className={cn("flex items-center justify-between gap-2 text-sm text-[var(--ret-text-muted)] leading-6")}>
								<span>Provider: {kind}</span>
								<span
									className={cn(
										"px-1.5 py-px",
										hasCreds
											? "border border-[var(--ret-green)]/40 text-[var(--ret-green)]"
											: "border border-[var(--ret-amber)]/40 text-[var(--ret-amber)]",
									)}
								>
									{hasCreds ? "Key on file" : "No key"}
								</span>
							</div>
						</button>
					);
				})}
			</div>
		</StepShell>
	);
}

function SpecStep({
	value,
	defaults,
	model,
	defaultModel,
	busy,
	onSave,
}: {
	value: MachineSpec;
	defaults: MachineSpec;
	model: string;
	defaultModel: string;
	busy: boolean;
	onSave: (spec: MachineSpec, model: string) => Promise<void>;
}) {
	const [vcpu, setVcpu] = useState(value.vcpu);
	const [memory, setMemory] = useState(value.memoryMib);
	const [storage, setStorage] = useState(value.storageGib);
	const [chosenModel, setChosenModel] = useState(
		model || defaultModel || DEFAULT_MODEL,
	);

	return (
		<StepShell
			title="Choose resources and model"
			description="These are requested resources. Provider limits and actual allocation can differ; check the Worker's allocation after launch."
		>
			<div className={cn("grid gap-5 sm:grid-cols-2 xl:grid-cols-4")}>
				<NumField
					label="vCPU"
					value={vcpu}
					onChange={setVcpu}
					min={1}
					max={16}
					hint={`default ${defaults.vcpu ?? DEFAULT_MACHINE_SPEC.vcpu}`}
				/>
				<NumField
					label="Memory (MiB)"
					value={memory}
					onChange={setMemory}
					min={512}
					max={65_536}
					step={512}
					hint={`default ${defaults.memoryMib ?? DEFAULT_MACHINE_SPEC.memoryMib}`}
				/>
				<NumField
					label="Storage (GiB)"
					value={storage}
					onChange={setStorage}
					min={5}
					max={200}
					hint={`default ${defaults.storageGib ?? DEFAULT_MACHINE_SPEC.storageGib}`}
				/>
				<TextField
					label="Model ID"
					value={chosenModel}
					onChange={setChosenModel}
					hint={`default ${defaultModel}`}
				/>
			</div>
			<div className={cn("flex justify-end")}>
				<ReticleButton
					variant="primary"
					size="sm"
					disabled={busy}
					onClick={() =>
						void onSave(
							{ vcpu, memoryMib: memory, storageGib: storage },
							chosenModel,
						)
					}
				>
					{busy ? "Saving..." : "Save and review"}
					<ArrowRight className={cn("h-4 w-4")} aria-hidden="true" />
				</ReticleButton>
			</div>
		</StepShell>
	);
}

function NumField({
	label,
	value,
	onChange,
	min,
	max,
	step,
	hint,
}: {
	label: string;
	value: number;
	onChange: (v: number) => void;
	min: number;
	max: number;
	step?: number;
	hint: string;
}) {
	return (
		<label className={cn("flex flex-col gap-1.5")}>
			<span className={cn("text-sm text-[var(--ret-text-muted)] leading-6")}>
				{label}
			</span>
			<input
				type="number"
				min={min}
				max={max}
				step={step ?? 1}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				className={FIELD_INPUT}
			/>
		<span className={cn("text-sm text-[var(--ret-text-muted)] leading-6")}>
			{hint}
		</span>
	</label>
	);
}

function TextField({
	label,
	value,
	onChange,
	hint,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	hint: string;
}) {
	return (
		<label className={cn("flex flex-col gap-1.5")}>
			<span className={cn("text-sm text-[var(--ret-text-muted)] leading-6")}>
				{label}
			</span>
			<input
				type="text"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className={FIELD_INPUT}
			/>
		<span className={cn("text-sm text-[var(--ret-text-muted)] leading-6")}>
			{hint}
		</span>
	</label>
	);
}

function ReviewStep({
	config,
	busy,
	onProvision,
	onBack,
}: {
	config: PublicUserConfig;
	busy: boolean;
	onProvision: () => Promise<void>;
	onBack: () => void;
}) {
	const memGib = (config.draftSpec.memoryMib / 1024).toFixed(1);
	const providerKind = config.draftProviderKind;
	const providerHasKey = config.providers[providerKind].configured;
	return (
		<StepShell
			title="Review your Worker"
			description="Launching creates a sandbox on your provider account, saves the machine, and prepares the selected runtime. Provider charges may apply."
		>
			<dl className={cn("grid gap-x-6 gap-y-1 sm:grid-cols-2")}>
				<Row label="Agent" value={config.draftAgentKind} />
				<Row label="Provider" value={providerKind} />
				<Row
					label="Requested resources"
					value={`${config.draftSpec.vcpu} vCPU · ${memGib} GiB RAM · ${config.draftSpec.storageGib} GiB disk`}
				/>
				<Row label="Model" value={config.draftModel} />
				<Row
					label={`${providerKind} key`}
					value={providerHasKey ? "on file" : "missing"}
					tone={providerHasKey ? "ok" : "warn"}
				/>
				<Row
					label="Cursor key"
					value={config.hasCursorKey ? "on file" : "not provided"}
					tone="muted"
				/>
				<Row
					label="Existing machines"
					value={String(config.machines.length)}
					tone="muted"
				/>
			</dl>
			<div className={cn("flex flex-wrap items-center justify-end gap-2")}>
				<ReticleButton variant="ghost" size="sm" onClick={onBack} disabled={busy}>
					<ArrowLeft className={cn("h-4 w-4")} aria-hidden="true" />
					Back
				</ReticleButton>
				<ReticleButton
					variant="primary"
					size="sm"
					onClick={() => void onProvision()}
					disabled={busy || !providerHasKey}
				>
					<Rocket className={cn("h-4 w-4")} aria-hidden="true" />
					{busy
						? "Provisioning + bootstrapping..."
						: providerHasKey
							? "Provision + bootstrap"
							: `No ${providerKind} key on file`}
				</ReticleButton>
			</div>
		</StepShell>
	);
}

function Row({
	label,
	value,
	tone,
}: {
	label: string;
	value: string;
	tone?: "ok" | "warn" | "muted";
}) {
	const valueClass =
		tone === "ok"
			? "text-[var(--ret-green)]"
			: tone === "warn"
				? "text-[var(--ret-amber)]"
				: tone === "muted"
					? "text-[var(--ret-text-muted)]"
					: "text-[var(--ret-text)]";
	return (
		<div className={cn("flex min-w-0 flex-col gap-1 border-b border-[var(--ret-border)]/35 py-4 text-base leading-7")}>
			<dt className={cn("text-sm text-[var(--ret-text-muted)]")}>{label}</dt>
			<dd className={cn("min-w-0 break-words font-medium", valueClass)}>{value}</dd>
		</div>
	);
}

function ProvisionedStep({
	config,
	onConfigure,
	onChat,
	onMachines,
}: {
	config: PublicUserConfig;
	onConfigure: () => void;
	onChat: () => void;
	onMachines: () => void;
}) {
	const active = config.machines.find((m) => m.id === config.activeMachineId && !m.archived);
	if (!active) {
		return (
			<StepShell
				title="No active Worker"
				description="Your saved setup is still here, but no active machine is linked to it. Configure a Worker or choose an existing one from your fleet."
			>
				<dl className={cn("grid gap-x-6 gap-y-1 sm:grid-cols-2")}>
					<Row label="Saved agent" value={AGENTS_DESC[config.draftAgentKind].name} />
					<Row label="Saved provider" value={PROVIDERS_DESC[config.draftProviderKind].name} />
				</dl>
				<div className={cn("flex flex-wrap justify-end gap-2")}>
					<ReticleButton variant="secondary" size="sm" onClick={onMachines}>
						<Server className={cn("h-4 w-4")} aria-hidden="true" />
						Open machines
					</ReticleButton>
					<ReticleButton variant="primary" size="sm" onClick={onConfigure}>
						Configure Worker
						<ArrowRight className={cn("h-4 w-4")} aria-hidden="true" />
					</ReticleButton>
				</div>
			</StepShell>
		);
	}
	return (
		<StepShell
			title="Your Worker is ready"
			description="The launch operation completed. Open chat to start working, or inspect the machine in your fleet."
		>
			<div className={cn("space-y-3")}>
				<dl className={cn("grid gap-x-6 gap-y-1 sm:grid-cols-2")}>
					<Row
						label="Active machine ID"
						value={active.id}
						tone="ok"
					/>
					<Row label="Agent" value={AGENTS_DESC[active.agentKind].name} />
					<Row label="Provider" value={PROVIDERS_DESC[active.providerKind].name} />
					<Row label="Total machines" value={String(config.machines.length)} />
				</dl>
			<p className={cn("border border-dashed border-[var(--ret-border)] bg-[var(--ret-surface)] p-3 text-sm text-[var(--ret-text-dim)] leading-6")}>
				Runtime status and recovery controls are available on the machine.
				If the agent needs attention, inspect its status before starting work.
			</p>
				<div className={cn("flex flex-wrap justify-end gap-2")}>
					<ReticleButton variant="secondary" size="sm" onClick={onMachines}>
						<Server className={cn("h-4 w-4")} aria-hidden="true" />
						Open machines
					</ReticleButton>
					<ReticleButton variant="primary" size="sm" onClick={onChat}>
						Open chat
						<ArrowRight className={cn("h-4 w-4")} aria-hidden="true" />
					</ReticleButton>
				</div>
			</div>
		</StepShell>
	);
}
