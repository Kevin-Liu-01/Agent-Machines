"use client";

import { useState } from "react";

import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { Logo } from "@/components/Logo";
import { ServiceIcon } from "@/components/ServiceIcon";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleHatch } from "@/components/reticle/ReticleHatch";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { WingBackground } from "@/components/WingBackground";
import { AGENTS } from "@/lib/agents";
import { TRUSTED_ADDONS } from "@/lib/dashboard/loadout";
import type {
	AgentProfile,
	BootstrapPreset,
	CustomLoadoutEntry,
	EnvironmentProfile,
	GatewayProfile,
	LoadoutPreset,
	LoadoutSource,
	ProviderCredentials,
	PublicUserConfig,
} from "@/lib/user-config/schema";

type Props = {
	initialConfig: PublicUserConfig;
};

type SaveState =
	| { phase: "idle" }
	| { phase: "saving" }
	| { phase: "ok"; message: string }
	| { phase: "error"; message: string };

export function SettingsPanel({ initialConfig }: Props) {
	const [config, setConfig] = useState(initialConfig);
	const [dedalusKey, setDedalusKey] = useState("");
	const [dedalusBaseUrl, setDedalusBaseUrl] = useState("");
	const [vercelKey, setVercelKey] = useState("");
	const [vercelTeamId, setVercelTeamId] = useState("");
	const [vercelProjectId, setVercelProjectId] = useState("");
	const [flyKey, setFlyKey] = useState("");
	const [flyOrgSlug, setFlyOrgSlug] = useState("");
	const [cursorApiKey, setCursorApiKey] = useState("");
	const [anthropicKey, setAnthropicKey] = useState("");
	const [openaiKey, setOpenaiKey] = useState("");
	const [openrouterKey, setOpenrouterKey] = useState("");
	const [googleKey, setGoogleKey] = useState("");
	const [vercelAiGatewayKey, setVercelAiGatewayKey] = useState("");
	const [customUrl, setCustomUrl] = useState("");
	const [customKey, setCustomKey] = useState("");
	const [customLabel, setCustomLabel] = useState("");
	const [gatewayJson, setGatewayJson] = useState(
		json(config.gatewayProfiles),
	);
	const [agentJson, setAgentJson] = useState(json(config.agentProfiles));
	const [envJson, setEnvJson] = useState(json(config.environmentProfiles));
	const [presetJson, setPresetJson] = useState(json(config.bootstrapPresets));
	const [loadoutJson, setLoadoutJson] = useState(json(config.customLoadout));
	const [sourceJson, setSourceJson] = useState(json(config.loadoutSources));
	const [loadoutPresetJson, setLoadoutPresetJson] = useState(
		json(config.loadoutPresets),
	);
	const [activeLoadoutPresetId, setActiveLoadoutPresetId] = useState(
		config.activeLoadoutPresetId,
	);
	const [state, setState] = useState<SaveState>({ phase: "idle" });

	async function save(): Promise<void> {
		setState({ phase: "saving" });
		try {
			const providers: ProviderCredentials = {};
			if (dedalusKey.trim() || dedalusBaseUrl.trim()) {
				providers.dedalus = {
					apiKey: dedalusKey.trim(),
					baseUrl: dedalusBaseUrl.trim() || undefined,
				};
			}
			if (vercelKey.trim() || vercelTeamId.trim() || vercelProjectId.trim()) {
				providers["vercel-sandbox"] = {
					apiKey: vercelKey.trim(),
					teamId: vercelTeamId.trim() || undefined,
					projectId: vercelProjectId.trim() || undefined,
				};
			}
			if (flyKey.trim() || flyOrgSlug.trim()) {
				providers.fly = {
					apiKey: flyKey.trim(),
					orgSlug: flyOrgSlug.trim() || undefined,
				};
			}
			const aiProviderKeys: Record<string, unknown> = {};
			if (anthropicKey.trim()) aiProviderKeys.anthropic = anthropicKey.trim();
			if (openaiKey.trim()) aiProviderKeys.openai = openaiKey.trim();
			if (openrouterKey.trim()) aiProviderKeys.openrouter = openrouterKey.trim();
			if (googleKey.trim()) aiProviderKeys.google = googleKey.trim();
			if (vercelAiGatewayKey.trim()) aiProviderKeys.vercelAiGateway = vercelAiGatewayKey.trim();
			if (customUrl.trim() && customKey.trim()) {
				aiProviderKeys.custom = {
					url: customUrl.trim(),
					key: customKey.trim(),
					label: customLabel.trim() || undefined,
				};
			}

			const response = await fetch("/api/dashboard/admin/settings", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					providers: Object.keys(providers).length > 0 ? providers : undefined,
					aiProviderKeys: Object.keys(aiProviderKeys).length > 0 ? aiProviderKeys : undefined,
					cursorApiKey: cursorApiKey.trim() || undefined,
					gatewayProfiles: parse<GatewayProfile[]>(gatewayJson),
					agentProfiles: parse<AgentProfile[]>(agentJson),
					environmentProfiles: parse<EnvironmentProfile[]>(envJson),
					bootstrapPresets: parse<BootstrapPreset[]>(presetJson),
					customLoadout: parse<CustomLoadoutEntry[]>(loadoutJson),
					loadoutSources: parse<LoadoutSource[]>(sourceJson),
					loadoutPresets: parse<LoadoutPreset[]>(loadoutPresetJson),
					activeLoadoutPresetId,
				}),
			});
			const body = (await response.json().catch(() => ({}))) as {
				config?: PublicUserConfig;
				message?: string;
			};
			if (!response.ok || !body.config) {
				throw new Error(body.message ?? `HTTP ${response.status}`);
			}
			setConfig(body.config);
			setState({ phase: "ok", message: "settings saved" });
		} catch (err) {
			setState({
				phase: "error",
				message: err instanceof Error ? err.message : "settings save failed",
			});
		}
	}

	async function syncFromMachine(): Promise<void> {
		setState({ phase: "saving" });
		try {
			const response = await fetch("/api/dashboard/admin/settings", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ syncFromMachine: true }),
			});
			const body = (await response.json().catch(() => ({}))) as {
				config?: PublicUserConfig;
				message?: string;
			};
			if (!response.ok || !body.config) {
				throw new Error(body.message ?? `HTTP ${response.status}`);
			}
			setConfig(body.config);
			setGatewayJson(json(body.config.gatewayProfiles));
			setAgentJson(json(body.config.agentProfiles));
			setEnvJson(json(body.config.environmentProfiles));
			setPresetJson(json(body.config.bootstrapPresets));
			setLoadoutJson(json(body.config.customLoadout));
			setSourceJson(json(body.config.loadoutSources));
			setLoadoutPresetJson(json(body.config.loadoutPresets));
			setActiveLoadoutPresetId(body.config.activeLoadoutPresetId);
			setState({ phase: "ok", message: "synced from machine settings.json" });
		} catch (err) {
			setState({
				phase: "error",
				message: err instanceof Error ? err.message : "sync failed",
			});
		}
	}

	return (
		<DashboardPageBody>
			<ReticleFrame>
				<ReticleHatch className="h-1.5 border-b border-[var(--ret-border)]" pitch={6} />
				<div className="grid gap-px bg-[var(--ret-border)] md:grid-cols-[1.2fr_0.6fr_0.6fr_0.6fr_0.6fr_0.6fr_0.6fr]">
					<div className="relative min-h-[120px] overflow-hidden bg-[var(--ret-bg)] p-3">
						<WingBackground
							variant="nyx-lines"
							opacity={{ light: 0.22, dark: 0.34 }}
							fadeEdges
						/>
						<div className="relative z-10">
							<ReticleLabel>CONFIG GRAPH</ReticleLabel>
							<p className="mt-2 max-w-[32ch] text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
								Settings become reusable recipes: AI keys, provider, gateway,
								agent, environment, then machine.
							</p>
						</div>
					</div>
					<Summary label="ai keys" value={aiProviderCount(config.aiProviders)} />
					<Summary label="hosts" value={configuredCount(config.providers)} />
					<Summary label="gateways" value={config.gatewayProfiles.length} />
					<Summary label="agents" value={config.agentProfiles.length} />
					<Summary label="sources" value={config.loadoutSources.length} />
					<Summary label="custom" value={config.customLoadout.length} />
				</div>
			</ReticleFrame>

			{state.phase !== "idle" ? (
				<ReticleFrame
					className={
						state.phase === "error"
							? "border-[var(--ret-red)]/50 bg-[var(--ret-red)]/5"
							: "border-[var(--ret-green)]/40 bg-[var(--ret-green)]/5"
					}
				>
					<p className="p-3 font-mono text-[11px] text-[var(--ret-text)]">
						{state.phase === "saving" ? "saving..." : state.message}
					</p>
				</ReticleFrame>
			) : null}

			<Section
				kicker="SECRETS"
				title="Provider credentials"
				description="Blank fields preserve existing secrets. Fill only what you want to add or rotate."
			>
				<div className="grid gap-px bg-[var(--ret-border)] md:grid-cols-3">
					<ProviderBox
						title="Dedalus"
						configured={config.providers.dedalus.configured}
						fields={[
							["API key", dedalusKey, setDedalusKey, "dsk-live-..."],
							["Base URL", dedalusBaseUrl, setDedalusBaseUrl, "https://dcs.dedaluslabs.ai"],
						]}
					/>
					<ProviderBox
						title="Vercel Sandbox"
						configured={config.providers["vercel-sandbox"].configured}
						fields={[
							["API token", vercelKey, setVercelKey, "vercel token"],
							["Team ID", vercelTeamId, setVercelTeamId, "team_..."],
							["Project ID", vercelProjectId, setVercelProjectId, "prj_..."],
						]}
					/>
					<ProviderBox
						title="Fly Machines"
						configured={config.providers.fly.configured}
						fields={[
							["API token", flyKey, setFlyKey, "FlyV1 ..."],
							["Org slug", flyOrgSlug, setFlyOrgSlug, "personal"],
						]}
					/>
				</div>
				<label className="mt-3 block font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					Cursor API key
					<input
						value={cursorApiKey}
						onChange={(event) => setCursorApiKey(event.target.value)}
						placeholder={config.hasCursorKey ? "configured (leave blank to preserve)" : "optional"}
						className="mt-1 w-full border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2 py-1.5 text-[12px] text-[var(--ret-text)]"
					/>
				</label>
			</Section>

			<Section
				kicker="AI PROVIDERS"
				title="LLM inference keys"
				description="Add your own API keys for any AI provider. Hermes and OpenClaw accept any OpenAI-compatible endpoint. Claude Code requires Anthropic. Codex requires OpenAI. Blank fields preserve existing keys."
			>
				<div className="mb-3 grid gap-px bg-[var(--ret-border)] md:grid-cols-4">
					{AGENTS.map((agent) => {
						const primaryKey = agent.providerKeys[0];
						const slug = agent.serviceSlug;
						return (
							<div key={agent.id} className="flex items-center gap-2 bg-[var(--ret-bg)] px-3 py-2">
								<Logo mark={agent.logoMark} size={14} />
								<div className="min-w-0 flex-1">
									<p className="truncate font-mono text-[10px] text-[var(--ret-text)]">{agent.name}</p>
									<p className="truncate font-mono text-[8px] text-[var(--ret-text-muted)]">{primaryKey}</p>
								</div>
								{slug ? (
									<ServiceIcon slug={slug} size={12} tone="mono" />
								) : null}
							</div>
						);
					})}
				</div>
				<div className="grid gap-px bg-[var(--ret-border)] md:grid-cols-2">
					<AiProviderBox
						title="Anthropic"
						hint="Claude Code, OpenClaw, Hermes"
						configured={config.aiProviders.anthropic.configured}
						fields={[
							["API key", anthropicKey, setAnthropicKey, "sk-ant-..."],
						]}
					/>
					<AiProviderBox
						title="OpenAI"
						hint="Codex CLI, OpenClaw, Hermes"
						configured={config.aiProviders.openai.configured}
						fields={[
							["API key", openaiKey, setOpenaiKey, "sk-..."],
						]}
					/>
					<AiProviderBox
						title="OpenRouter"
						hint="Hermes, OpenClaw -- routes 200+ models"
						configured={config.aiProviders.openrouter.configured}
						fields={[
							["API key", openrouterKey, setOpenrouterKey, "sk-or-..."],
						]}
					/>
					<AiProviderBox
						title="Vercel AI Gateway"
						hint="Hermes, OpenClaw -- managed gateway"
						configured={config.aiProviders.vercelAiGateway.configured}
						fields={[
							["API key", vercelAiGatewayKey, setVercelAiGatewayKey, "vai-..."],
						]}
					/>
					<AiProviderBox
						title="Google AI"
						hint="Hermes -- Gemini models"
						configured={config.aiProviders.google.configured}
						fields={[
							["API key", googleKey, setGoogleKey, "AIza..."],
						]}
					/>
				</div>
				<div className="mt-px grid gap-px bg-[var(--ret-border)]">
					<AiProviderBox
						title="Custom gateway"
						hint="LiteLLM, Portkey, RelayPlane, self-hosted -- any OpenAI-compatible endpoint"
						configured={config.aiProviders.custom.configured}
						fields={[
							["Label", customLabel, setCustomLabel, "My gateway"],
							["Base URL", customUrl, setCustomUrl, "https://my-gateway.example.com/v1"],
							["API key", customKey, setCustomKey, "key-..."],
						]}
					/>
				</div>
			</Section>

			<Section
				kicker="PROFILES"
				title="Reusable machine configuration"
				description="These JSON arrays are account-level. Existing bundled sources are the opinionated default preset; add GitHub repos, URLs, MCP servers, CLIs, npm packages, or manual tools and compose your own presets."
			>
				<CatalogHint />
				<JsonEditor label="Gateway profiles" value={gatewayJson} onChange={setGatewayJson} />
				<JsonEditor label="Agent profiles" value={agentJson} onChange={setAgentJson} />
				<JsonEditor label="Environment profiles" value={envJson} onChange={setEnvJson} />
				<JsonEditor label="Bootstrap presets" value={presetJson} onChange={setPresetJson} />
				<label className="mb-3 block">
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						Active loadout preset
					</span>
					<input
						value={activeLoadoutPresetId}
						onChange={(event) => setActiveLoadoutPresetId(event.target.value)}
						className="mt-1 w-full border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-2 font-mono text-[11px] text-[var(--ret-text)]"
					/>
				</label>
				<JsonEditor label="Loadout sources" value={sourceJson} onChange={setSourceJson} />
				<JsonEditor label="Loadout presets" value={loadoutPresetJson} onChange={setLoadoutPresetJson} />
				<JsonEditor label="Custom skills / tools / MCP / CLI / plugins" value={loadoutJson} onChange={setLoadoutJson} />
			</Section>

			<div className="flex flex-wrap justify-end gap-2">
				<ReticleButton variant="ghost" onClick={() => void syncFromMachine()}>
					Sync from machine
				</ReticleButton>
				<ReticleButton variant="primary" onClick={() => void save()}>
					Save settings
				</ReticleButton>
			</div>
		</DashboardPageBody>
	);
}

function Section({
	kicker,
	title,
	description,
	children,
}: {
	kicker: string;
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<ReticleFrame>
			<div className="border-b border-[var(--ret-border)] px-3 py-2">
				<div className="flex items-center gap-2">
					<ReticleLabel>{kicker}</ReticleLabel>
					<ReticleBadge>{title}</ReticleBadge>
				</div>
				<p className="mt-1 max-w-[80ch] text-[12px] leading-relaxed text-[var(--ret-text-dim)]">
					{description}
				</p>
			</div>
			<div className="p-3">{children}</div>
		</ReticleFrame>
	);
}

function Summary({ label, value }: { label: string; value: number }) {
	return (
		<div className="bg-[var(--ret-bg)] px-3 py-2">
			<p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				{label}
			</p>
			<p className="font-mono text-lg tabular-nums text-[var(--ret-text)]">{value}</p>
		</div>
	);
}

function ProviderBox({
	title,
	configured,
	fields,
}: {
	title: string;
	configured: boolean;
	fields: Array<[string, string, (value: string) => void, string]>;
}) {
	return (
		<div className="bg-[var(--ret-bg)] p-3">
			<div className="mb-2 flex items-center justify-between gap-2">
				<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ret-text)]">
					{title}
				</p>
				<ReticleBadge variant={configured ? "success" : "default"}>
					{configured ? "configured" : "empty"}
				</ReticleBadge>
			</div>
			<div className="space-y-2">
				{fields.map(([label, value, onChange, placeholder]) => (
					<label key={label} className="block font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						{label}
						<input
							value={value}
							onChange={(event) => onChange(event.target.value)}
							placeholder={placeholder}
							className="mt-1 w-full border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-1 text-[12px] normal-case tracking-normal text-[var(--ret-text)]"
						/>
					</label>
				))}
			</div>
		</div>
	);
}

function AiProviderBox({
	title,
	hint,
	configured,
	fields,
}: {
	title: string;
	hint: string;
	configured: boolean;
	fields: Array<[string, string, (value: string) => void, string]>;
}) {
	return (
		<div className="bg-[var(--ret-bg)] p-3">
			<div className="mb-1.5 flex items-center justify-between gap-2">
				<div>
					<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ret-text)]">
						{title}
					</p>
					<p className="font-mono text-[9px] text-[var(--ret-text-muted)]">
						{hint}
					</p>
				</div>
				<ReticleBadge variant={configured ? "success" : "default"}>
					{configured ? "configured" : "empty"}
				</ReticleBadge>
			</div>
			<div className="space-y-2">
				{fields.map(([label, value, onChange, placeholder]) => (
					<label key={label} className="block font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						{label}
						<input
							value={value}
							onChange={(event) => onChange(event.target.value)}
							placeholder={configured && label.toLowerCase().includes("key") ? "configured (leave blank to preserve)" : placeholder}
							className="mt-1 w-full border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-1 text-[12px] normal-case tracking-normal text-[var(--ret-text)]"
						/>
					</label>
				))}
			</div>
		</div>
	);
}

function CatalogHint() {
	const preview = TRUSTED_ADDONS.slice(0, 8);
	return (
		<div className="mb-3 grid gap-px bg-[var(--ret-border)] lg:grid-cols-[0.9fr_1.1fr]">
			<div className="bg-[var(--ret-bg)] p-3">
				<ReticleLabel>AVAILABLE CATALOG</ReticleLabel>
				<p className="mt-2 text-[12px] leading-relaxed text-[var(--ret-text-dim)]">
					{TRUSTED_ADDONS.length} trusted add-ons are shown on the Loadout
					page. To add one, copy its source into `loadoutSources` or create a
					`customLoadout` entry, then include that ID in a `loadoutPresets`
					record.
				</p>
				<pre className="mt-3 overflow-x-auto border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-2 font-mono text-[10px] text-[var(--ret-text-dim)]">
					{`{
  "id": "my-tool",
  "name": "My Tool",
  "kind": "cli",
  "description": "What the agent can use it for",
  "command": "my-tool",
  "enabled": true
}`}
				</pre>
			</div>
			<div className="bg-[var(--ret-bg)] p-3">
				<ReticleLabel>STARTING POINTS</ReticleLabel>
				<div className="mt-2 grid gap-1 sm:grid-cols-2">
					{preview.map((item) => (
						<div
							key={item.id}
							className="border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-1.5"
						>
							<div className="flex items-center justify-between gap-2">
								<p className="truncate font-mono text-[11px] text-[var(--ret-text)]">
									{item.name}
								</p>
								<ReticleBadge className="px-1.5 py-0 text-[9px]">
									{item.kind}
								</ReticleBadge>
							</div>
							<p className="mt-0.5 truncate font-mono text-[9px] text-[var(--ret-text-muted)]">
								{item.source}
							</p>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function JsonEditor({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<label className="mb-3 block">
			<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				{label}
			</span>
			<textarea
				value={value}
				onChange={(event) => onChange(event.target.value)}
				rows={7}
				className="mt-1 w-full resize-y border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-2 font-mono text-[11px] leading-relaxed text-[var(--ret-text)]"
				spellCheck={false}
			/>
		</label>
	);
}

function json(value: unknown): string {
	return JSON.stringify(value, null, 2);
}

function parse<T>(value: string): T {
	return JSON.parse(value) as T;
}

function configuredCount(providers: PublicUserConfig["providers"]): number {
	return Object.values(providers).filter((provider) => provider.configured).length;
}

function aiProviderCount(aiProviders: PublicUserConfig["aiProviders"]): number {
	return Object.values(aiProviders).filter((p) => p.configured).length;
}
