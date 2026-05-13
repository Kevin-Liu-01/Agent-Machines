"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { Logo } from "@/components/Logo";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleHatch } from "@/components/reticle/ReticleHatch";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { cn } from "@/lib/cn";
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
	hasOwnerDedalusKey: boolean;
	hasOwnerCursorKey: boolean;
	hasOwnerMachine: boolean;
};

type Props = {
	initialConfig: PublicUserConfig;
	defaults: WizardDefaults;
};

type StepDef = { id: SetupStep; label: string; hint: string };

const STEPS: ReadonlyArray<StepDef> = [
	{ id: "api-key", label: "Credentials", hint: "provider key(s)" },
	{ id: "agent", label: "Agent", hint: "personality" },
	{ id: "provider", label: "Provider", hint: "where it runs" },
	{ id: "spec", label: "Spec", hint: "size + model" },
	{ id: "review", label: "Review", hint: "confirm" },
	{ id: "provisioned", label: "Done", hint: "machine live" },
];

const AGENTS_DESC: Record<
	AgentKind,
	{ name: string; tagline: string; logo: "nous" | "dedalus" | "anthropic" | "openai" }
> = {
	hermes: {
		name: "Hermes",
		tagline:
			"Nous Research's self-improving agent. Persistent memory, automation scheduling, MCP-native, OpenAI-compatible API.",
		logo: "nous",
	},
	openclaw: {
		name: "OpenClaw",
		tagline:
			"Persistent computer-use agent. Browser, shell, filesystem, screenshots, and vision on the same durable machine.",
		logo: "nous",
	},
	"claude-code": {
		name: "Claude Code",
		tagline:
			"Anthropic's terminal coding agent. Deep repo awareness, multi-step tool use, headless via claude -p, Agent SDK.",
		logo: "anthropic",
	},
	codex: {
		name: "Codex CLI",
		tagline:
			"OpenAI's terminal coding agent. Sandbox isolation, workspace-write mode, non-interactive via codex exec.",
		logo: "openai",
	},
};

const PROVIDERS_DESC: Record<
	ProviderKind,
	{ name: string; tagline: string; ready: boolean; keyHint: string }
> = {
	dedalus: {
		name: "Dedalus Machines",
		tagline:
			"Firecracker microVMs with sleep/wake, persistent /home/machine, cloudflared previews. The original.",
		ready: true,
		keyHint: "dsk-live-...",
	},
	"vercel-sandbox": {
		name: "Vercel Sandbox",
		tagline:
			"Ephemeral Firecracker sessions from Vercel. Best for short-lived OpenClaw/browser tasks with external storage.",
		ready: false,
		keyHint: "Vercel API token",
	},
	fly: {
		name: "Fly Machines",
		tagline:
			"Fly.io persistent microVMs with volumes. Alternative host for durable Hermes or OpenClaw machines.",
		ready: false,
		keyHint: "fly_pat_... or FlyV1 ...",
	},
};

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
				phase?: string;
				message?: string;
				error?: string;
			};
			if (!response.ok) {
				setError(body.message ?? `provision failed (HTTP ${response.status})`);
				return;
			}
			if (!body.machineId) {
				setError("provision failed: missing machine id");
				return;
			}
			const bootstrap = await fetch("/api/dashboard/admin/bootstrap", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ machineId: body.machineId }),
			});
			const bootstrapBody = (await bootstrap.json().catch(() => ({}))) as {
				message?: string;
				error?: string;
			};
			if (!bootstrap.ok) {
				setError(
					bootstrapBody.message ??
						bootstrapBody.error ??
						`bootstrap failed (HTTP ${bootstrap.status})`,
				);
				return;
			}
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
		<div className="space-y-6 px-5 py-5">
			<StepRail
				active={activeStep}
				completed={completedSteps}
				onJump={(step) => setActiveStep(step)}
			/>

			{error ? (
				<ReticleFrame className="border-[var(--ret-red)]/50 bg-[var(--ret-red)]/5 p-4">
					<p className="font-mono text-[11px] text-[var(--ret-red)]">
						error: {error}
					</p>
				</ReticleFrame>
			) : null}

			{activeStep === "api-key" ? (
				<CredentialsStep
					config={config}
					hasOwnerDedalusKey={defaults.hasOwnerDedalusKey}
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
		<ol className="grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] sm:grid-cols-3 lg:grid-cols-6">
			{STEPS.map((step, idx) => {
				const isActive = step.id === active;
				const isDone = completed.has(step.id);
				const reachable = isActive || isDone;
				return (
					<li
						key={step.id}
						className={cn(
							"flex items-center gap-3 bg-[var(--ret-bg)] px-3 py-3",
							reachable
								? "cursor-pointer hover:bg-[var(--ret-surface)]"
								: "cursor-not-allowed opacity-60",
						)}
						onClick={() => {
							if (reachable) onJump(step.id);
						}}
					>
						<span
							className={cn(
								"flex h-5 w-5 items-center justify-center border font-mono text-[10px]",
								isDone
									? "border-[var(--ret-green)]/40 bg-[var(--ret-green)]/10 text-[var(--ret-green)]"
									: isActive
										? "border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
										: "border-[var(--ret-border)] text-[var(--ret-text-muted)]",
							)}
						>
							{isDone ? "ok" : idx + 1}
						</span>
						<div className="min-w-0">
							<p className="font-mono text-[11px] text-[var(--ret-text)]">
								{step.label}
							</p>
							<p className="font-mono text-[10px] text-[var(--ret-text-muted)]">
								{step.hint}
							</p>
						</div>
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
		<ReticleFrame>
			<ReticleHatch
				className="h-1.5 border-b border-[var(--ret-border)]"
				pitch={6}
			/>
			<div className="space-y-4 p-5">
				<header>
					<ReticleLabel>step</ReticleLabel>
					<h2 className="ret-display mt-1 text-base">{title}</h2>
					<p className="mt-1 max-w-[68ch] text-[12px] text-[var(--ret-text-dim)]">
						{description}
					</p>
				</header>
				{children}
			</div>
		</ReticleFrame>
	);
}

type CredsState = {
	dedalus: string;
	vercelSandbox: string;
	vercelSandboxTeam: string;
	fly: string;
	flyOrg: string;
	cursor: string;
	anthropic: string;
	openai: string;
};

function CredentialsStep({
	config,
	hasOwnerDedalusKey,
	busy,
	onSave,
}: {
	config: PublicUserConfig;
	hasOwnerDedalusKey: boolean;
	busy: boolean;
	onSave: (
		creds: {
			dedalus?: { apiKey: string };
			"vercel-sandbox"?: { apiKey: string; teamId?: string };
			fly?: { apiKey: string; orgSlug?: string };
		},
		cursorApiKey: string | undefined,
		aiProviderKeys: Record<string, string> | undefined,
	) => Promise<void>;
}) {
	const [state, setState] = useState<CredsState>({
		dedalus: "",
		vercelSandbox: "",
		vercelSandboxTeam: "",
		fly: "",
		flyOrg: "",
		cursor: "",
		anthropic: "",
		openai: "",
	});

	const dedalusOnFile = config.providers.dedalus.configured;
	const vercelOnFile = config.providers["vercel-sandbox"].configured;
	const flyOnFile = config.providers.fly.configured;
	const cursorOnFile = config.hasCursorKey;
	const anthropicOnFile = config.aiProviders.anthropic.configured;
	const openaiOnFile = config.aiProviders.openai.configured;
	const anyConfigured =
		dedalusOnFile || vercelOnFile || flyOnFile || hasOwnerDedalusKey ||
		anthropicOnFile || openaiOnFile;

	function buildPatch() {
		const creds: Parameters<typeof onSave>[0] = {};
		if (state.dedalus.trim()) {
			creds.dedalus = { apiKey: state.dedalus.trim() };
		}
		if (state.vercelSandbox.trim()) {
			creds["vercel-sandbox"] = {
				apiKey: state.vercelSandbox.trim(),
				teamId: state.vercelSandboxTeam.trim() || undefined,
			};
		}
		if (state.fly.trim()) {
			creds.fly = {
				apiKey: state.fly.trim(),
				orgSlug: state.flyOrg.trim() || undefined,
			};
		}
		const cursor = state.cursor.trim();
		const aiKeys: Record<string, string> = {};
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
			title="Bring API keys for the providers you'll use"
			description="Infrastructure keys provision the machine. AI provider keys power the agent's LLM inference. Each is stored in Clerk private metadata, never exposed to the browser."
		>
			<ReticleLabel>infrastructure providers</ReticleLabel>
			<div className="mt-2 grid gap-4 lg:grid-cols-3">
				<KeyField
					label="Dedalus API key"
					placeholder="dsk-live-..."
					value={state.dedalus}
					onChange={(v) => setState((s) => ({ ...s, dedalus: v }))}
					hint={
						dedalusOnFile
							? "On file. Leave blank to keep."
							: hasOwnerDedalusKey
								? "Owner default exists. Leave blank to inherit."
								: "Required for the Dedalus provider."
					}
				/>
				<KeyField
					label="Vercel API token"
					placeholder="Vercel API token"
					value={state.vercelSandbox}
					onChange={(v) => setState((s) => ({ ...s, vercelSandbox: v }))}
					hint={
						vercelOnFile ? "On file. Leave blank to keep." : "Optional. Provisioner not wired yet."
					}
					secondary={{
						label: "Vercel team id (optional)",
						placeholder: "team_...",
						value: state.vercelSandboxTeam,
						onChange: (v) =>
							setState((s) => ({ ...s, vercelSandboxTeam: v })),
					}}
				/>
				<KeyField
					label="Fly.io token"
					placeholder="fly_pat_... or FlyV1 ..."
					value={state.fly}
					onChange={(v) => setState((s) => ({ ...s, fly: v }))}
					hint={
						flyOnFile ? "On file. Leave blank to keep." : "Optional. Provisioner not wired yet."
					}
					secondary={{
						label: "Fly org slug (optional)",
						placeholder: "personal",
						value: state.flyOrg,
						onChange: (v) => setState((s) => ({ ...s, flyOrg: v })),
					}}
				/>
			</div>

			<ReticleLabel className="mt-5">ai provider keys</ReticleLabel>
			<p className="mt-1 text-[12px] text-[var(--ret-text-dim)]">
				Hermes and OpenClaw accept any of these. Claude Code requires Anthropic. Codex requires OpenAI.
			</p>
			<div className="mt-2 grid gap-4 lg:grid-cols-2">
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
			<div className="flex flex-wrap items-center justify-end gap-2">
				<ReticleButton
					variant="ghost"
					size="sm"
					onClick={() => onSave({}, undefined, undefined)}
					disabled={busy || !anyConfigured}
				>
					Skip (use existing)
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
				</ReticleButton>
			</div>
		</StepShell>
	);
}

function KeyField({
	label,
	placeholder,
	value,
	onChange,
	hint,
	secondary,
}: {
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
		<div className="flex flex-col gap-2">
			<label className="flex flex-col gap-1.5">
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{label}
				</span>
				<input
					type="password"
					autoComplete="off"
					placeholder={placeholder}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2 font-mono text-[12px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-none"
				/>
				<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
					{hint}
				</span>
			</label>
			{secondary ? (
				<label className="flex flex-col gap-1.5">
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						{secondary.label}
					</span>
					<input
						type="text"
						autoComplete="off"
						placeholder={secondary.placeholder}
						value={secondary.value}
						onChange={(e) => secondary.onChange(e.target.value)}
						className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2 font-mono text-[12px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-none"
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
			title="Pick your agent"
			description="The personality and toolset baked into the gateway. You can switch later from the navbar; switching after provisioning rewrites SOUL.md and restarts the gateway."
		>
			<div className="grid gap-4 md:grid-cols-2">
				{AGENT_KINDS.map((kind) => {
					const meta = AGENTS_DESC[kind];
					const selected = value === kind;
					return (
						<button
							key={kind}
							type="button"
							disabled={busy}
							onClick={() => void onSelect(kind)}
							className={cn(
								"group relative flex flex-col gap-3 border bg-[var(--ret-bg)] p-4 text-left transition-colors",
								selected
									? "border-[var(--ret-purple)] bg-[var(--ret-purple-glow)]"
									: "border-[var(--ret-border)] hover:border-[var(--ret-border-hover)] hover:bg-[var(--ret-surface)]",
							)}
						>
							<div className="flex items-center justify-between gap-3">
								<div className="flex items-center gap-2">
									<Logo mark={meta.logo} size={18} />
									<h3 className="font-mono text-[13px] text-[var(--ret-text)]">
										{meta.name}
									</h3>
								</div>
								{selected ? (
									<ReticleBadge variant="accent">selected</ReticleBadge>
								) : null}
							</div>
							<p className="text-[12px] leading-relaxed text-[var(--ret-text-dim)]">
								{meta.tagline}
							</p>
							<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								agent: {kind}
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
			title="Pick the provider"
			description="Where the agent's microVM lives. Dedalus is wired end-to-end today. Vercel Sandbox and Fly accept credentials and feed the same multi-tenant shape, but their provisioners are not wired yet."
		>
			<div className="grid gap-4 md:grid-cols-3">
				{PROVIDER_KINDS.map((kind) => {
					const meta = PROVIDERS_DESC[kind];
					const selected = value === kind;
					const hasCreds = configured[kind].configured;
					return (
						<button
							key={kind}
							type="button"
							disabled={busy || !meta.ready}
							onClick={() => {
								if (meta.ready) void onSelect(kind);
							}}
							className={cn(
								"flex flex-col gap-3 border bg-[var(--ret-bg)] p-4 text-left transition-colors",
								selected
									? "border-[var(--ret-purple)] bg-[var(--ret-purple-glow)]"
									: "border-[var(--ret-border)] hover:border-[var(--ret-border-hover)]",
								!meta.ready && "cursor-not-allowed opacity-60 hover:border-[var(--ret-border)]",
							)}
						>
							<div className="flex items-center justify-between gap-3">
								<h3 className="font-mono text-[13px] text-[var(--ret-text)]">
									{meta.name}
								</h3>
								{!meta.ready ? (
									<ReticleBadge variant="warning">pr4</ReticleBadge>
								) : selected ? (
									<ReticleBadge variant="accent">selected</ReticleBadge>
								) : (
									<ReticleBadge variant="success">ready</ReticleBadge>
								)}
							</div>
							<p className="text-[12px] leading-relaxed text-[var(--ret-text-dim)]">
								{meta.tagline}
							</p>
							<div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								<span>provider: {kind}</span>
								<span
									className={cn(
										"px-1.5 py-px",
										hasCreds
											? "border border-[var(--ret-green)]/40 text-[var(--ret-green)]"
											: "border border-[var(--ret-amber)]/40 text-[var(--ret-amber)]",
									)}
								>
									{hasCreds ? "key on file" : "no key"}
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
			title="Size the box"
			description="Defaults: 1 vCPU, 2 GiB RAM, 10 GiB disk -- enough for Hermes + cursor-bridge at idle. Bump RAM if you plan to schedule heavy crons."
		>
			<div className="grid gap-4 md:grid-cols-4">
				<NumField
					label="vCPU"
					value={vcpu}
					onChange={setVcpu}
					min={1}
					max={16}
					hint={`default ${defaults.vcpu ?? DEFAULT_MACHINE_SPEC.vcpu}`}
				/>
				<NumField
					label="memory (MiB)"
					value={memory}
					onChange={setMemory}
					min={512}
					max={65_536}
					step={512}
					hint={`default ${defaults.memoryMib ?? DEFAULT_MACHINE_SPEC.memoryMib}`}
				/>
				<NumField
					label="storage (GiB)"
					value={storage}
					onChange={setStorage}
					min={5}
					max={200}
					hint={`default ${defaults.storageGib ?? DEFAULT_MACHINE_SPEC.storageGib}`}
				/>
				<TextField
					label="model id"
					value={chosenModel}
					onChange={setChosenModel}
					hint={`default ${defaultModel}`}
				/>
			</div>
			<div className="flex justify-end">
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
		<label className="flex flex-col gap-1.5">
			<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				{label}
			</span>
			<input
				type="number"
				min={min}
				max={max}
				step={step ?? 1}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2 font-mono text-[12px] text-[var(--ret-text)] focus:border-[var(--ret-purple)] focus:outline-none"
			/>
			<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
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
		<label className="flex flex-col gap-1.5">
			<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				{label}
			</span>
			<input
				type="text"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2 font-mono text-[12px] text-[var(--ret-text)] focus:border-[var(--ret-purple)] focus:outline-none"
			/>
			<span className="font-mono text-[10px] text-[var(--ret-text-muted)]">
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
			title="Confirm and provision"
			description="Provisioning hits the chosen provider, saves the new machine ID, then runs browser-driven bootstrap so the selected agent gateway is written back to the machine record."
		>
			<dl className="grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] sm:grid-cols-2">
				<Row label="agent" value={config.draftAgentKind} />
				<Row label="provider" value={providerKind} />
				<Row
					label="spec"
					value={`${config.draftSpec.vcpu} vCPU . ${memGib} GiB RAM . ${config.draftSpec.storageGib} GiB disk`}
				/>
				<Row label="model" value={config.draftModel} />
				<Row
					label={`${providerKind} key`}
					value={providerHasKey ? "on file" : "missing"}
					tone={providerHasKey ? "ok" : "warn"}
				/>
				<Row
					label="cursor key"
					value={config.hasCursorKey ? "on file" : "not provided"}
					tone="muted"
				/>
				<Row
					label="existing machines"
					value={String(config.machines.length)}
					tone="muted"
				/>
			</dl>
			<div className="flex flex-wrap items-center justify-end gap-2">
				<ReticleButton variant="ghost" size="sm" onClick={onBack} disabled={busy}>
					Back
				</ReticleButton>
				<ReticleButton
					variant="primary"
					size="sm"
					onClick={() => void onProvision()}
					disabled={busy || !providerHasKey}
				>
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
		<div className="flex items-center justify-between gap-3 bg-[var(--ret-bg)] px-3 py-2 font-mono text-[12px]">
			<dt className="text-[var(--ret-text-muted)]">{label}</dt>
			<dd className={cn("truncate text-right", valueClass)}>{value}</dd>
		</div>
	);
}

function ProvisionedStep({
	config,
	onChat,
	onMachines,
}: {
	config: PublicUserConfig;
	onChat: () => void;
	onMachines: () => void;
}) {
	const active = config.machines.find((m) => m.id === config.activeMachineId);
	return (
		<StepShell
			title="Machine bootstrapped"
			description="Saved to your Clerk metadata with a bootstrapped agent gateway URL/key. You can open chat now or manage the machine from fleet controls."
		>
			<div className="space-y-3">
				<dl className="grid gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] sm:grid-cols-2">
					<Row
						label="active machine id"
						value={active?.id ?? config.activeMachineId ?? "--"}
						tone="ok"
					/>
					<Row label="agent" value={active?.agentKind ?? config.draftAgentKind} />
					<Row label="provider" value={active?.providerKind ?? config.draftProviderKind} />
					<Row label="total machines" value={String(config.machines.length)} />
				</dl>
				<p className="border border-dashed border-[var(--ret-border)] bg-[var(--ret-surface)] p-3 font-mono text-[11px] text-[var(--ret-text-dim)]">
					Gateway status is saved on the machine record. If the tunnel expires,
					open chat and click Bootstrap agent to refresh the gateway URL/key.
				</p>
				<div className="flex flex-wrap justify-end gap-2">
					<ReticleButton variant="secondary" size="sm" onClick={onMachines}>
						Open machines
					</ReticleButton>
					<ReticleButton variant="primary" size="sm" onClick={onChat}>
						Open chat
					</ReticleButton>
				</div>
			</div>
		</StepShell>
	);
}
