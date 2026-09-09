"use client";

import { useEffect, useRef, useState } from "react";

import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { Logo, type Mark } from "@/components/Logo";
import { ServiceIcon } from "@/components/ServiceIcon";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ReticleSelect } from "@/components/reticle/ReticleSelect";
import { AGENTS } from "@/lib/agents";
import { TRUSTED_ADDONS } from "@/lib/dashboard/loadout";
import { groupedModelCatalog, modelDisplayLabel } from "@/lib/dashboard/model-catalog";
import {
	CREDENTIAL_OPTIONS,
	type CredentialRemovalResult,
	type CredentialSelector,
} from "@/lib/user-config/credential-removal";
import {
	AGENT_KINDS,
	AGENT_LABEL,
	PROVIDER_KINDS,
	PROVIDER_LABEL,
} from "@/lib/user-config/schema";
import type {
	BootstrapPreset,
	CustomLoadoutEntry,
	EnvironmentProfile,
	GatewayProfile,
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

type CredentialField = [
	label: string,
	value: string,
	onChange: (value: string) => void,
	placeholder: string,
	type: "password" | "text",
];

export function SettingsPanel({ initialConfig }: Props) {
	const [config, setConfig] = useState(initialConfig);
	const [daytonaKey, setDaytonaKey] = useState("");
	const [daytonaApiUrl, setDaytonaApiUrl] = useState("");
	const [daytonaTarget, setDaytonaTarget] = useState("");
	const [spritesKey, setSpritesKey] = useState("");
	const [e2bKey, setE2bKey] = useState("");
	const [vercelToken, setVercelToken] = useState("");
	const [vercelTeamId, setVercelTeamId] = useState("");
	const [vercelProjectId, setVercelProjectId] = useState("");
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
	const [envJson, setEnvJson] = useState(json(config.environmentProfiles));
	const [presetJson, setPresetJson] = useState(json(config.bootstrapPresets));
	const [loadoutJson, setLoadoutJson] = useState(json(config.customLoadout));
	const [sourceJson, setSourceJson] = useState(json(config.loadoutSources));
	const [state, setState] = useState<SaveState>({ phase: "idle" });
	// Which instant-save Active-configuration control is mid-flight.
	const [savingField, setSavingField] = useState<string | null>(null);
	const [credentialSelection, setCredentialSelection] = useState("");
	const [removalState, setRemovalState] = useState<SaveState>({ phase: "idle" });
	const settingsWriteInFlight = useRef(false);
	const busy = state.phase === "saving" || savingField !== null || removalState.phase === "saving";
	const removableCredentials = CREDENTIAL_OPTIONS.filter((option) => credentialConfigured(config, option.id));
	const selectedCredential = removableCredentials.find((option) => option.id === credentialSelection);

	// Active configuration writes a single field and reflects the returned
	// config immediately, so switching agent/substrate/model/loadout feels
	// like flipping a setting rather than filling a form.
	async function applyConfigPatch(
		endpoint: "setup" | "settings",
		body: Record<string, unknown>,
		field: string,
	): Promise<void> {
		if (settingsWriteInFlight.current) return;
		settingsWriteInFlight.current = true;
		setSavingField(field);
		try {
			const response = await fetch(`/api/dashboard/admin/${endpoint}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			const result = (await response.json().catch(() => ({}))) as {
				config?: PublicUserConfig;
				message?: string;
			};
			if (!response.ok || !result.config) {
				throw new Error(result.message ?? `HTTP ${response.status}`);
			}
			setConfig(result.config);
			setState({ phase: "ok", message: `${field} updated` });
		} catch (err) {
			setState({
				phase: "error",
				message: err instanceof Error ? err.message : `${field} update failed`,
			});
		} finally {
			settingsWriteInFlight.current = false;
			setSavingField(null);
		}
	}

	async function save(): Promise<void> {
		if (settingsWriteInFlight.current) return;
		settingsWriteInFlight.current = true;
		setState({ phase: "saving" });
		try {
			const providers: ProviderCredentials = {};
			if (daytonaKey.trim() || daytonaApiUrl.trim() || daytonaTarget.trim()) {
				providers.daytona = {
					apiKey: daytonaKey.trim(),
					apiUrl: daytonaApiUrl.trim() || undefined,
					target: daytonaTarget.trim() || undefined,
				};
			}
		if (spritesKey.trim()) {
			providers.sprites = { apiKey: spritesKey.trim() };
		}
		if (e2bKey.trim()) {
			providers.e2b = { apiKey: e2bKey.trim() };
		}
		if (vercelToken.trim() && vercelTeamId.trim() && vercelProjectId.trim()) {
			providers.vercel = {
				token: vercelToken.trim(),
				teamId: vercelTeamId.trim(),
				projectId: vercelProjectId.trim(),
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
					environmentProfiles: parse<EnvironmentProfile[]>(envJson),
					bootstrapPresets: parse<BootstrapPreset[]>(presetJson),
					customLoadout: parse<CustomLoadoutEntry[]>(loadoutJson),
					loadoutSources: parse<LoadoutSource[]>(sourceJson),
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
		} finally {
			settingsWriteInFlight.current = false;
		}
	}

	async function syncFromMachine(): Promise<void> {
		if (settingsWriteInFlight.current) return;
		settingsWriteInFlight.current = true;
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
			setEnvJson(json(body.config.environmentProfiles));
			setPresetJson(json(body.config.bootstrapPresets));
			setLoadoutJson(json(body.config.customLoadout));
			setSourceJson(json(body.config.loadoutSources));
			setState({ phase: "ok", message: "synced from machine settings.json" });
		} catch (err) {
			setState({
				phase: "error",
				message: err instanceof Error ? err.message : "sync failed",
			});
		} finally {
			settingsWriteInFlight.current = false;
		}
	}

	async function removeCredential(): Promise<void> {
		if (settingsWriteInFlight.current || !selectedCredential) return;
		const { id, label } = selectedCredential;
		if (!window.confirm(`Remove the saved ${label} credential from this account?\n\nThis also clears any unsaved value for this credential. It does not revoke the key at the vendor, stop sandboxes, or erase copies already installed in Workers or profiles. Future work may fail until you add a replacement. Deployment-provided defaults, if any, remain available.`)) return;
		settingsWriteInFlight.current = true;
		setRemovalState({ phase: "saving" });
		// Clear the selected draft even if the response is lost after the server removes it.
		// A later Save must not silently restore the credential the user asked to remove.
		const clearInputs: Record<CredentialSelector, Array<(value: string) => void>> = {
			"provider:daytona": [setDaytonaKey, setDaytonaApiUrl, setDaytonaTarget],
			"provider:e2b": [setE2bKey],
			"provider:sprites": [setSpritesKey],
			"provider:vercel": [setVercelToken, setVercelTeamId, setVercelProjectId],
			"provider:dedalus": [],
			"model:anthropic": [setAnthropicKey],
			"model:openai": [setOpenaiKey],
			"model:openrouter": [setOpenrouterKey],
			"model:google": [setGoogleKey],
			"model:vercelAiGateway": [setVercelAiGatewayKey],
			"model:custom": [setCustomKey, setCustomUrl, setCustomLabel],
			cursor: [setCursorApiKey],
		};
		clearInputs[id].forEach((clear) => clear(""));
		let removedMessage: string | null = null;
		try {
			const response = await fetch("/api/dashboard/admin/settings", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ credentials: [id] }),
			});
			const result = (await response.json().catch(() => ({}))) as Partial<CredentialRemovalResult> & { message?: string };
			if (!response.ok || !Array.isArray(result.removed) || !result.removed.includes(id) || !Array.isArray(result.stillConfigured)) {
				throw new Error(result.message ?? "Could not confirm credential removal. Refresh Settings to check its status.");
			}
			const stillConfigured = result.stillConfigured.includes(id);
			removedMessage = `${label}: this account's saved copy was removed. ${stillConfigured
				? "Still configured through a deployment-provided default; that default was not removed."
				: "No account credential remains configured."}`;
			setConfig((current) => withCredentialConfigured(current, id, stillConfigured));
			setCredentialSelection("");
			const refresh = await fetch("/api/dashboard/admin/settings", { cache: "no-store" });
			const refreshed = (await refresh.json().catch(() => ({}))) as { config?: PublicUserConfig; message?: string };
			if (!refresh.ok || !refreshed.config) throw new Error("The Settings refresh failed. Reload to check other configuration.");
			setConfig(refreshed.config);
			setRemovalState({ phase: "ok", message: removedMessage });
		} catch (error) {
			const detail = error instanceof Error ? error.message : "Could not confirm credential removal.";
			setRemovalState({ phase: "error", message: removedMessage ? `${removedMessage} ${detail}` : detail });
		} finally {
			settingsWriteInFlight.current = false;
		}
	}

	return (
		<DashboardPageBody>
			{state.phase !== "idle" ? (
				<ReticleFrame
					className={
						state.phase === "error"
							? "border-[var(--ret-red)]/50 bg-[var(--ret-red)]/5"
							: "border-[var(--ret-green)]/40 bg-[var(--ret-green)]/5"
					}
				>
				<p className="p-3 text-[11px] text-[var(--ret-text)]">
					{state.phase === "saving" ? "saving..." : state.message}
				</p>
				</ReticleFrame>
			) : null}

			<DeveloperApiKey />

			<fieldset disabled={busy} className="contents" aria-label="Account settings">
			<Section
				kicker="ACTIVE CONFIGURATION"
				title="Defaults for new machines"
				description="What every new machine inherits. These save instantly. Per-machine model/agent and the router are chosen at deploy time; abilities come from the deployed Worker's Memory."
			>
				<div className="grid gap-px bg-[var(--ret-border)] sm:grid-cols-2 lg:grid-cols-3">
					<ConfigSelect
						label="Agent"
						value={config.draftAgentKind}
						saving={savingField === "agent"}
						onChange={(value) =>
							void applyConfigPatch("setup", { draftAgentKind: value }, "agent")
						}
						options={AGENT_KINDS.map((kind) => ({
							value: kind,
							label: AGENT_LABEL[kind],
						}))}
					/>
					<ConfigSelect
						label="Substrate"
						value={config.draftProviderKind}
						saving={savingField === "substrate"}
						onChange={(value) =>
							void applyConfigPatch("setup", { draftProviderKind: value }, "substrate")
						}
						options={PROVIDER_KINDS.map((kind) => ({
							value: kind,
							label: PROVIDER_LABEL[kind],
						}))}
					/>
					<ModelConfigSelect
						value={config.draftModel}
						saving={savingField === "model"}
						onChange={(value) =>
							void applyConfigPatch("setup", { draftModel: value }, "model")
						}
					/>
				</div>
			</Section>

			<Section
				kicker="SECRETS"
				title="Provider credentials"
				description="Blank fields preserve existing secrets. Fill only what you want to add or rotate."
			>
			<div className="grid gap-px bg-[var(--ret-border)] md:grid-cols-2 lg:grid-cols-5">
				<ProviderBox
					title="Daytona"
					mark="daytona"
					configured={config.providers.daytona.configured}
					fields={[
						["API key", daytonaKey, setDaytonaKey, "Daytona API key", "password"],
						["API URL", daytonaApiUrl, setDaytonaApiUrl, "https://app.daytona.io/api", "text"],
						["Target (optional)", daytonaTarget, setDaytonaTarget, "us", "text"],
					]}
				/>
				<ProviderBox
					title="E2B Sandbox"
					mark="e2b"
					configured={config.providers.e2b.configured}
					fields={[
						["API key", e2bKey, setE2bKey, "e2b_...", "password"],
					]}
				/>
				<ProviderBox
					title="Sprites"
					mark="sprites"
					configured={config.providers.sprites.configured}
					fields={[
						["Token", spritesKey, setSpritesKey, "kevin-liu-553/...", "password"],
					]}
				/>
				<ProviderBox
					title="Vercel Sandbox"
					mark="vercel"
					configured={config.providers.vercel.configured}
					fields={[
						["Token", vercelToken, setVercelToken, "vercel token", "password"],
						["Team ID", vercelTeamId, setVercelTeamId, "team_...", "text"],
						["Project ID", vercelProjectId, setVercelProjectId, "prj_...", "text"],
					]}
				/>
			</div>
				<label className="mt-3 block font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					Cursor API key
					<input
						type="password"
						autoComplete="off"
						autoCapitalize="none"
						autoCorrect="off"
						spellCheck={false}
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
						title="Vercel AI Gateway"
						hint="Hermes, OpenClaw preferred"
						configured={config.aiProviders.vercelAiGateway.configured}
						fields={[
							["API key", vercelAiGatewayKey, setVercelAiGatewayKey, "vck_...", "password"],
						]}
					/>
					<AiProviderBox
						title="OpenRouter"
						hint="Hermes, OpenClaw fallback"
						configured={config.aiProviders.openrouter.configured}
						fields={[
							["API key", openrouterKey, setOpenrouterKey, "sk-or-...", "password"],
						]}
					/>
					<AiProviderBox
						title="Anthropic"
						hint="Claude Code, OpenClaw, Hermes"
						configured={config.aiProviders.anthropic.configured}
						fields={[
							["API key", anthropicKey, setAnthropicKey, "sk-ant-...", "password"],
						]}
					/>
					<AiProviderBox
						title="OpenAI"
						hint="Codex CLI, OpenClaw, Hermes"
						configured={config.aiProviders.openai.configured}
						fields={[
							["API key", openaiKey, setOpenaiKey, "sk-...", "password"],
						]}
					/>
					<AiProviderBox
						title="Google AI"
						hint="Hermes -- Gemini models"
						configured={config.aiProviders.google.configured}
						fields={[
							["API key", googleKey, setGoogleKey, "AIza...", "password"],
						]}
					/>
				</div>
				<div className="mt-px grid gap-px bg-[var(--ret-border)]">
					<AiProviderBox
						title="Custom gateway"
						hint="LiteLLM, Portkey, RelayPlane, self-hosted -- any OpenAI-compatible endpoint"
						configured={config.aiProviders.custom.configured}
						fields={[
							["Label", customLabel, setCustomLabel, "My gateway", "text"],
							["Base URL", customUrl, setCustomUrl, "https://my-gateway.example.com/v1", "text"],
							["API key", customKey, setCustomKey, "key-...", "password"],
						]}
					/>
				</div>
			</Section>

			<Section
				kicker="CREDENTIAL CONTROL"
				title="Remove a saved credential"
				description="Remove a provider, model, or tool credential saved to this account. Blank fields above still preserve saved credentials."
			>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<div className="min-w-0 flex-1">
						<ReticleSelect
							ariaLabel="Saved credential to remove"
							value={selectedCredential?.id ?? ""}
							onChange={setCredentialSelection}
							placeholder={removableCredentials.length ? "Choose a configured credential" : "No credentials configured"}
							options={removableCredentials.map((option) => ({ value: option.id, label: option.label }))}
						/>
					</div>
					<ReticleButton
						variant="ghost"
						disabled={busy || !selectedCredential}
						aria-describedby="credential-removal-limits"
						onClick={() => void removeCredential()}
					>
						{removalState.phase === "saving" ? "Removing…" : "Remove saved credential"}
					</ReticleButton>
				</div>
				<p id="credential-removal-limits" className="mt-2 max-w-[90ch] text-[12px] leading-relaxed text-[var(--ret-text-dim)]">
					This removes only this account’s saved copy. It does not revoke the vendor key,
					stop sandboxes, or erase copies already installed in Workers or profiles.
					Future work may fail until you add a replacement. Revoke compromised keys with the vendor.
				</p>
				<p role="status" aria-live="polite" className="mt-2 text-[12px] text-[var(--ret-text)]">
					{removalState.phase === "saving" ? "Removing saved credential…"
						: removalState.phase === "idle" ? "" : removalState.message}
				</p>
			</Section>

			<details className="group">
				<summary className="flex cursor-pointer list-none items-center justify-between gap-2 border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2.5">
					<span className="flex items-center gap-2">
						<ReticleLabel>ADVANCED</ReticleLabel>
						<ReticleBadge>Profiles &amp; loadout (raw JSON)</ReticleBadge>
					</span>
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)] group-open:hidden">
						show
					</span>
					<span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)] group-open:inline">
						hide
					</span>
				</summary>
				<div className="border border-t-0 border-[var(--ret-border)] bg-[var(--ret-bg)] p-3">
					<p className="mb-3 max-w-[80ch] text-[12px] leading-relaxed text-[var(--ret-text-dim)]">
						Account-level recipes: bundled sources are the opinionated default;
						add GitHub repos, URLs, MCP servers, CLIs, npm packages, or manual
						tools and compose presets. Gateway profiles are your routers. Edit
						the JSON, then Save settings below.
					</p>
					<CatalogHint />
					<JsonEditor label="Gateway profiles (routers)" value={gatewayJson} onChange={setGatewayJson} />
					<JsonEditor label="Environment profiles" value={envJson} onChange={setEnvJson} />
					<JsonEditor label="Bootstrap presets" value={presetJson} onChange={setPresetJson} />
					<JsonEditor label="Loadout sources" value={sourceJson} onChange={setSourceJson} />
					<JsonEditor label="Imported pool (skills / tools / MCP / CLI / plugins)" value={loadoutJson} onChange={setLoadoutJson} />
				</div>
			</details>

			<div className="flex flex-wrap justify-end gap-2">
				<ReticleButton variant="ghost" onClick={() => void syncFromMachine()}>
					Sync from machine
				</ReticleButton>
				<ReticleButton variant="primary" onClick={() => void save()}>
					Save settings
				</ReticleButton>
			</div>
			</fieldset>
		</DashboardPageBody>
	);
}

function credentialConfigured(config: PublicUserConfig, selector: CredentialSelector): boolean {
	if (selector === "cursor") return config.hasCursorKey;
	if (selector.startsWith("provider:")) return config.providers[selector.slice(9) as keyof PublicUserConfig["providers"]].configured;
	return config.aiProviders[selector.slice(6) as keyof PublicUserConfig["aiProviders"]].configured;
}

function withCredentialConfigured(config: PublicUserConfig, selector: CredentialSelector, configured: boolean): PublicUserConfig {
	if (selector === "cursor") return { ...config, hasCursorKey: configured };
	if (selector.startsWith("provider:")) {
		const key = selector.slice(9) as keyof PublicUserConfig["providers"];
		return { ...config, providers: { ...config.providers, [key]: { ...config.providers[key], configured } } };
	}
	const key = selector.slice(6) as keyof PublicUserConfig["aiProviders"];
	return { ...config, aiProviders: { ...config.aiProviders, [key]: { ...config.aiProviders[key], configured } } };
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

function ConfigSelect({
	label,
	value,
	options,
	onChange,
	saving,
	hint,
}: {
	label: string;
	value: string;
	options: ReadonlyArray<{ value: string; label: string }>;
	onChange: (value: string) => void;
	saving: boolean;
	hint?: string;
}) {
	return (
		<div className="bg-[var(--ret-bg)] p-3">
			<div className="mb-1.5 flex items-center justify-between gap-2">
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{label}
				</p>
				{saving ? (
					<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-purple)]">
						saving…
					</span>
				) : null}
			</div>
			<ReticleSelect
				ariaLabel={label}
				value={value}
				onChange={onChange}
				options={options.map((o) => ({ value: o.value, label: o.label }))}
			/>
			{hint ? (
				<p className="mt-1 text-[9px] text-[var(--ret-text-muted)]">{hint}</p>
			) : null}
		</div>
	);
}

function ModelConfigSelect({
	value,
	onChange,
	saving,
}: {
	value: string;
	onChange: (value: string) => void;
	saving: boolean;
}) {
	const groups = groupedModelCatalog();
	const known = groups.some((group) =>
		group.models.some((model) => model.id === value),
	);
	const options = [
		...(known
			? []
			: [{ value, label: value ? modelDisplayLabel(value) : "—", group: "Current" }]),
		...groups.flatMap((group) =>
			group.models.map((model) => ({
				value: model.id,
				label: model.label,
				group: group.label,
			})),
		),
	];
	return (
		<div className="bg-[var(--ret-bg)] p-3">
			<div className="mb-1.5 flex items-center justify-between gap-2">
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					Model
				</p>
				{saving ? (
					<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-purple)]">
						saving…
					</span>
				) : null}
			</div>
			<ReticleSelect ariaLabel="Model" value={value} onChange={onChange} options={options} />
		</div>
	);
}

function ProviderBox({
	title,
	mark,
	configured,
	fields,
}: {
	title: string;
	mark?: Mark;
	configured: boolean;
	fields: CredentialField[];
}) {
	return (
		<div className="bg-[var(--ret-bg)] p-3">
			<div className="mb-2 flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					{mark ? <Logo mark={mark} size={14} tone="auto" /> : null}
					<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ret-text)]">
						{title}
					</p>
				</div>
				<ReticleBadge variant={configured ? "success" : "default"}>
					{configured ? "configured" : "empty"}
				</ReticleBadge>
			</div>
			<div className="space-y-2">
				{fields.map(([label, value, onChange, placeholder, type]) => (
					<label key={label} className="block font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						{label}
						<input
							type={type}
							autoComplete="off"
							autoCapitalize="none"
							autoCorrect="off"
							spellCheck={false}
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
	fields: CredentialField[];
}) {
	return (
		<div className="bg-[var(--ret-bg)] p-3">
			<div className="mb-1.5 flex items-center justify-between gap-2">
				<div>
					<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ret-text)]">
						{title}
					</p>
				<p className="text-[9px] text-[var(--ret-text-muted)]">
					{hint}
				</p>
				</div>
				<ReticleBadge variant={configured ? "success" : "default"}>
					{configured ? "configured" : "empty"}
				</ReticleBadge>
			</div>
			<div className="space-y-2">
				{fields.map(([label, value, onChange, placeholder, type]) => (
					<label key={label} className="block font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
						{label}
						<input
							type={type}
							autoComplete="off"
							autoCapitalize="none"
							autoCorrect="off"
							spellCheck={false}
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
					{TRUSTED_ADDONS.length} trusted add-ons are browsable in the Registry.
					Installing one adds a `customLoadout` entry to your imported pool;
					a Memory then selects from that pool (or `*` for all of it).
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

type ApiKeyInfo = {
	prefix: string;
	lastFour: string;
	createdAt: string;
};

function DeveloperApiKey() {
	const [key, setKey] = useState<ApiKeyInfo | null>(null);
	const [token, setToken] = useState<string | null>(null);
	const [phase, setPhase] = useState<"loading" | "idle" | "working">("loading");
	const [message, setMessage] = useState<string | null>(null);

	useEffect(() => {
		let alive = true;
		void fetch("/api/dashboard/api-key")
			.then(async (response) => {
				const body = (await response.json().catch(() => ({}))) as {
					key?: ApiKeyInfo | null;
					message?: string;
				};
				if (!response.ok) {
					throw new Error(
						response.status === 401
							? "Sign in with Clerk to manage API keys."
							: body.message ?? "Could not load API key",
					);
				}
				if (alive) setKey(body.key ?? null);
			})
			.catch((error: unknown) => {
				if (alive) setMessage(error instanceof Error ? error.message : "Could not load API key");
			})
			.finally(() => {
				if (alive) setPhase("idle");
			});
		return () => {
			alive = false;
		};
	}, []);

	async function rotate(): Promise<void> {
		setPhase("working");
		setMessage(null);
		try {
			const response = await fetch("/api/dashboard/api-key", { method: "POST" });
			const body = (await response.json().catch(() => ({}))) as {
				token?: string;
				key?: ApiKeyInfo;
				message?: string;
			};
			if (!response.ok || !body.token || !body.key) {
				throw new Error(body.message ?? "Could not create API key");
			}
			setKey(body.key);
			setToken(body.token);
			setMessage("Copy this key now. It will not be shown again.");
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Could not create API key");
		} finally {
			setPhase("idle");
		}
	}

	async function revoke(): Promise<void> {
		setPhase("working");
		setMessage(null);
		try {
			const response = await fetch("/api/dashboard/api-key", { method: "DELETE" });
			const body = (await response.json().catch(() => ({}))) as { message?: string };
			if (!response.ok) throw new Error(body.message ?? "Could not revoke API key");
			setKey(null);
			setToken(null);
			setMessage("API key revoked.");
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Could not revoke API key");
		} finally {
			setPhase("idle");
		}
	}

	return (
		<Section
			kicker="DEVELOPER API"
			title="Connect the Agent Machines SDK"
			description="Create a user-scoped key for scripts and servers. Keys are stored as hashes and can be rotated or revoked here."
		>
			<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
				<div className="flex min-h-28 flex-col justify-between border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-3">
					<div className="flex items-center justify-between gap-3">
						<div>
							<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								API key
							</p>
							<p className="mt-1 font-mono text-[12px] text-[var(--ret-text)]">
								{phase === "loading"
									? "Checking…"
									: key
										? `${key.prefix}••••${key.lastFour}`
										: "No key yet"}
							</p>
						</div>
						<ReticleBadge variant={key ? "success" : "default"}>
							{key ? "active" : "off"}
						</ReticleBadge>
					</div>
					<div className="mt-4 flex flex-wrap gap-2">
						<ReticleButton size="sm" onClick={() => void rotate()} disabled={phase !== "idle"}>
							{key ? "Rotate key" : "Create key"}
						</ReticleButton>
						{key ? (
							<ReticleButton size="sm" variant="ghost" onClick={() => void revoke()} disabled={phase !== "idle"}>
								Revoke
							</ReticleButton>
						) : null}
					</div>
				</div>
				<div className="min-w-0 border border-[var(--ret-border)] bg-[var(--ret-bg)] p-3">
					{token ? (
						<div className="mb-3 flex items-center gap-2">
							<code className="min-w-0 flex-1 overflow-x-auto border border-[var(--ret-purple)]/40 bg-[var(--ret-purple)]/5 px-2 py-2 text-[11px] text-[var(--ret-text)]">
								{token}
							</code>
							<ReticleButton size="sm" variant="secondary" onClick={() => void navigator.clipboard.writeText(token)}>
								Copy
							</ReticleButton>
						</div>
					) : null}
					<pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-[var(--ret-text-dim)]">{`export AGENT_MACHINES_URL=https://www.agent-machines.dev
export AGENT_MACHINES_API_KEY=${token ?? "am_live_…"}

import { AgentMachines } from "agent-machines";
const am = new AgentMachines();
const agent = await am.create({ agent: "codex", sandbox: "e2b" });`}</pre>
					{message ? <p className="mt-2 text-[10px] text-[var(--ret-text-muted)]">{message}</p> : null}
				</div>
			</div>
		</Section>
	);
}
