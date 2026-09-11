"use client";

import { useEffect, useRef, useState } from "react";

import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { ArrowRight, ChevronDown } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
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
			<div className={cn("flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ret-border)] pb-5")}>
				<nav aria-label="Settings sections" className={cn("flex flex-wrap gap-x-5 gap-y-3 text-sm text-[var(--ret-text-muted)]")}>
					<a href="#compute-credentials" className={cn("underline-offset-4 hover:text-[var(--ret-text)] hover:underline")}>Compute</a>
					<a href="#model-credentials" className={cn("underline-offset-4 hover:text-[var(--ret-text)] hover:underline")}>Models</a>
					<a href="#workspace-defaults" className={cn("underline-offset-4 hover:text-[var(--ret-text)] hover:underline")}>Defaults</a>
					<a href="#developer-access" className={cn("underline-offset-4 hover:text-[var(--ret-text)] hover:underline")}>Developer API</a>
				</nav>
				<a href="/dashboard/setup" className={cn("inline-flex items-center gap-2 text-sm font-medium underline-offset-4 hover:underline")}>Open quickstart <ArrowRight size={16} aria-hidden="true" /></a>
			</div>
			{state.phase !== "idle" ? (
				<ReticleFrame
					className={
						state.phase === "error"
							? "border-[var(--ret-red)]/50 bg-[var(--ret-red)]/5"
							: "border-[var(--ret-green)]/40 bg-[var(--ret-green)]/5"
					}
				>
				<p role="status" aria-live="polite" className={cn("p-4 text-sm text-[var(--ret-text)]")}>
					{state.phase === "saving" ? "saving..." : state.message}
				</p>
				</ReticleFrame>
			) : null}

			<fieldset disabled={busy} className={cn("min-w-0 space-y-6")} aria-label="Account settings">
			<Section
				id="workspace-defaults"
				kicker="ACTIVE CONFIGURATION"
				title="Defaults for new workspaces"
				description="These selections save immediately. They set starting values for new setups, without changing already deployed workspaces. Choose a model supported by the selected runtime and your credentials."
			>
				<div className={cn("grid gap-px bg-[var(--ret-border)] sm:grid-cols-2 lg:grid-cols-3")}>
					<ConfigSelect
						label="Agent runtime"
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
						label="Compute provider"
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
				id="compute-credentials"
				kicker="SECRETS"
				title="Compute accounts"
				description="Open a provider to add or replace its credentials, then save settings. Blank fields preserve existing secrets. Keys on file have not necessarily been validated."
			>
			<div className={cn("grid items-start gap-3 md:grid-cols-2")}>
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
				<label className={cn("mt-5 block text-sm font-medium text-[var(--ret-text-muted)]")}>
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
						className={cn("mt-2 min-h-11 w-full rounded-md border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-2 text-base text-[var(--ret-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]")}
					/>
				</label>
			</Section>

			<Section
				id="model-credentials"
				kicker="AI PROVIDERS"
				title="LLM inference keys"
				description="Connect a supported model provider. Hermes and OpenClaw can use supported OpenAI-compatible endpoints; model and tool compatibility varies. Hosted Claude Code requires native Anthropic credentials, and Codex requires native OpenAI credentials. Blank fields preserve existing keys."
			>
				<div className={cn("mb-3 grid gap-px bg-[var(--ret-border)] md:grid-cols-4")}>
					{AGENTS.map((agent) => {
						const primaryKey = agent.providerKeys[0];
						const slug = agent.serviceSlug;
						return (
							<div key={agent.id} className={cn("flex items-center gap-2 bg-[var(--ret-bg)] px-3 py-2")}>
								<Logo mark={agent.logoMark} size={14} />
								<div className={cn("min-w-0 flex-1")}>
									<p className={cn("truncate text-sm text-[var(--ret-text)]")}>{agent.name}</p>
									<p className={cn("truncate text-sm text-[var(--ret-text-muted)]")}>{primaryKey}</p>
								</div>
								{slug ? (
									<ServiceIcon slug={slug} size={12} tone="mono" />
								) : null}
							</div>
						);
					})}
				</div>
				<div className={cn("grid items-start gap-3 md:grid-cols-2")}>
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
				<div className={cn("mt-3")}>
					<AiProviderBox
						title="Custom gateway"
						hint="Supported OpenAI-compatible endpoints, including compatible self-hosted gateways. Check the endpoint's model and tool support."
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
				<div className={cn("flex flex-col gap-2 sm:flex-row sm:items-center")}>
					<div className={cn("min-w-0 flex-1")}>
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
				<p id="credential-removal-limits" className={cn("mt-4 max-w-[90ch] text-sm leading-6 text-[var(--ret-text-muted)]")}>
					This removes only this account’s saved copy. It does not revoke the vendor key,
					stop sandboxes, or erase copies already installed in Workers or profiles.
					Future work may fail until you add a replacement. Revoke compromised keys with the vendor.
				</p>
				<p role="status" aria-live="polite" className={cn("mt-3 text-sm text-[var(--ret-text)]")}>
					{removalState.phase === "saving" ? "Removing saved credential…"
						: removalState.phase === "idle" ? "" : removalState.message}
				</p>
			</Section>

			<details className={cn("group rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]")}>
				<summary className={cn("flex cursor-pointer list-none items-center justify-between gap-2 px-6 py-5 text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)] [&::-webkit-details-marker]:hidden")}>
					Advanced profiles and loadouts
					<ChevronDown size={18} aria-hidden="true" className={cn("shrink-0 text-[var(--ret-text-muted)] group-open:rotate-180")} />
				</summary>
				<div className={cn("border-t border-[var(--ret-border)] p-6")}>
					<p className={cn("mb-5 max-w-[80ch] text-sm leading-6 text-[var(--ret-text-muted)]")}>
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

			<div className={cn("sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg)] p-4")}>
				<p className={cn("text-sm text-[var(--ret-text-muted)]")}>Credentials and advanced edits save together.</p>
				<div className={cn("flex flex-wrap gap-3")}>
				<ReticleButton variant="ghost" onClick={() => void syncFromMachine()}>
					Sync from machine
				</ReticleButton>
				<ReticleButton variant="primary" onClick={() => void save()}>
					Save settings
				</ReticleButton>
				</div>
			</div>
			</fieldset>
			<DeveloperApiKey />
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
	id,
	title,
	description,
	children,
}: {
	id?: string;
	kicker: string;
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<section id={id} className={cn("scroll-mt-24")}>
		<ReticleFrame className={cn("rounded-lg bg-[var(--ret-bg-soft)]")}>
			<div className={cn("border-b border-[var(--ret-border)] px-5 py-5 sm:px-6")}>
				<h2 className={cn("text-xl font-medium text-[var(--ret-text)]")}>{title}</h2>
				<p className={cn("mt-2 max-w-[88ch] text-sm leading-6 text-[var(--ret-text-muted)]")}>
					{description}
				</p>
			</div>
			<div className={cn("p-5 sm:p-6")}>{children}</div>
		</ReticleFrame>
		</section>
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
		<div className={cn("bg-[var(--ret-bg)] p-3")}>
			<div className={cn("mb-1.5 flex items-center justify-between gap-2")}>
				<p className={cn("text-sm font-medium text-[var(--ret-text-muted)]")}>
					{label}
				</p>
				{saving ? (
					<span className={cn("text-sm font-medium text-[var(--ret-purple)]")}>
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
				<p className={cn("mt-1 text-sm text-[var(--ret-text-muted)]")}>{hint}</p>
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
		<div className={cn("bg-[var(--ret-bg)] p-3")}>
			<div className={cn("mb-1.5 flex items-center justify-between gap-2")}>
				<p className={cn("text-sm font-medium text-[var(--ret-text-muted)]")}>
					Model
				</p>
				{saving ? (
					<span className={cn("text-sm font-medium text-[var(--ret-purple)]")}>
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
		<details className={cn("group rounded-md border border-[var(--ret-border)] bg-[var(--ret-bg)]")}>
			<summary className={cn("flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 p-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)] [&::-webkit-details-marker]:hidden")}>
				<div className={cn("flex items-center gap-3")}>
					{mark ? <Logo mark={mark} size={22} tone="auto" /> : null}
					<p className={cn("text-base font-medium text-[var(--ret-text)]")}>
						{title}
					</p>
				</div>
				<span className={cn("flex items-center gap-2 text-sm text-[var(--ret-text-muted)]")}>{configured ? "Key on file" : "Not connected"}<ChevronDown size={16} aria-hidden="true" className={cn("shrink-0 group-open:rotate-180")} /></span>
			</summary>
			<div className={cn("space-y-4 border-t border-[var(--ret-border)] p-4")}>
				{fields.map(([label, value, onChange, placeholder, type]) => (
					<label key={label} className={cn("block text-sm text-[var(--ret-text-muted)]")}>
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
							className={cn("mt-2 min-h-11 w-full rounded-md border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-2 text-base text-[var(--ret-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]")}
						/>
					</label>
				))}
			</div>
		</details>
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
		<details className={cn("group rounded-md border border-[var(--ret-border)] bg-[var(--ret-bg)]")}>
			<summary className={cn("flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 p-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)] [&::-webkit-details-marker]:hidden")}>
				<div>
					<p className={cn("text-base font-medium text-[var(--ret-text)]")}>
						{title}
					</p>
				<p className={cn("mt-1 text-sm leading-5 text-[var(--ret-text-muted)]")}>
					{hint}
				</p>
				</div>
				<span className={cn("flex shrink-0 items-center gap-2 text-sm text-[var(--ret-text-muted)]")}>{configured ? "Key on file" : "Not connected"}<ChevronDown size={16} aria-hidden="true" className={cn("shrink-0 group-open:rotate-180")} /></span>
			</summary>
			<div className={cn("space-y-4 border-t border-[var(--ret-border)] p-4")}>
				{fields.map(([label, value, onChange, placeholder, type]) => (
					<label key={label} className={cn("block text-sm text-[var(--ret-text-muted)]")}>
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
							className={cn("mt-2 min-h-11 w-full rounded-md border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-2 text-base text-[var(--ret-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]")}
						/>
					</label>
				))}
			</div>
		</details>
	);
}

function CatalogHint() {
	const preview = TRUSTED_ADDONS.slice(0, 8);
	return (
		<div className={cn("mb-3 grid gap-px bg-[var(--ret-border)] lg:grid-cols-[0.9fr_1.1fr]")}>
			<div className={cn("bg-[var(--ret-bg)] p-3")}>
				<ReticleLabel>AVAILABLE CATALOG</ReticleLabel>
				<p className={cn("mt-2 text-sm leading-relaxed text-[var(--ret-text-dim)]")}>
					{TRUSTED_ADDONS.length} trusted add-ons are browsable in the Registry.
					Installing one adds a `customLoadout` entry to your imported pool;
					a Memory then selects from that pool (or `*` for all of it).
				</p>
				<pre className={cn("mt-3 overflow-x-auto border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-2 font-mono text-sm text-[var(--ret-text-dim)]")}>
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
			<div className={cn("bg-[var(--ret-bg)] p-3")}>
				<ReticleLabel>STARTING POINTS</ReticleLabel>
				<div className={cn("mt-2 grid gap-1 sm:grid-cols-2")}>
					{preview.map((item) => (
						<div
							key={item.id}
							className={cn("border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-1.5")}
						>
							<div className={cn("flex items-center justify-between gap-2")}>
								<p className={cn("truncate text-sm text-[var(--ret-text)]")}>
									{item.name}
								</p>
								<ReticleBadge className={cn("px-1.5 py-0 text-sm")}>
									{item.kind}
								</ReticleBadge>
							</div>
							<p className={cn("mt-0.5 truncate text-sm text-[var(--ret-text-muted)]")}>
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
		<label className={cn("mb-3 block")}>
			<span className={cn("text-sm font-medium text-[var(--ret-text-muted)]")}>
				{label}
			</span>
			<textarea
				value={value}
				onChange={(event) => onChange(event.target.value)}
				rows={7}
				className={cn("mt-1 w-full resize-y border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-2 font-mono text-sm leading-relaxed text-[var(--ret-text)]")}
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

function isApiKeyInfo(value: unknown): value is ApiKeyInfo {
	if (!value || typeof value !== "object") return false;
	const info = value as Record<string, unknown>;
	return ["prefix", "lastFour", "createdAt"].every((field) => typeof info[field] === "string" && Boolean((info[field] as string).trim()));
}

function DeveloperApiKey() {
	const [key, setKey] = useState<ApiKeyInfo | null>(null);
	const [token, setToken] = useState<string | null>(null);
	const [phase, setPhase] = useState<"loading" | "ready" | "auth-required" | "error">("loading");
	const [action, setAction] = useState<"create" | "rotate" | "revoke" | "copy" | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [messageError, setMessageError] = useState(false);
	const [refresh, setRefresh] = useState(0);
	const requestBusy = useRef(false);
	const keyInfoRef = useRef<ApiKeyInfo | null>(null);

	useEffect(() => {
		let alive = true;
		const controller = new AbortController();
		requestBusy.current = true;
		setPhase("loading");
		setMessage(null);
		setMessageError(false);
		void fetch("/api/dashboard/api-key", { cache: "no-store", signal: controller.signal })
			.then(async (response) => {
				const body = (await response.json().catch(() => ({}))) as {
					configured?: boolean;
					key?: unknown;
				};
				if (!alive) return;
				if (response.status === 401) {
					setPhase("auth-required");
					setToken(null);
					return;
				}
				if (!response.ok || !((body.configured === false && body.key === null) || (body.configured === true && isApiKeyInfo(body.key)))) {
					throw new Error("Could not check your API key. Retry before creating or changing a key.");
				}
				const nextKey = isApiKeyInfo(body.key) ? body.key : null;
				const previous = keyInfoRef.current;
				if (!nextKey || previous?.createdAt !== nextKey.createdAt || previous?.lastFour !== nextKey.lastFour) setToken(null);
				keyInfoRef.current = nextKey;
				setKey(nextKey);
				setPhase("ready");
			})
			.catch(() => {
				if (alive) setPhase("error");
			})
			.finally(() => {
				if (alive) requestBusy.current = false;
			});
		return () => {
			alive = false;
			controller.abort();
			requestBusy.current = false;
		};
	}, [refresh]);

	async function rotate(): Promise<void> {
		if (phase !== "ready" || requestBusy.current) return;
		if (key && !window.confirm("Rotate this API key? The current key will stop working immediately. Update every script and service that uses it. You can copy the replacement only once.")) return;
		requestBusy.current = true;
		setAction(key ? "rotate" : "create");
		setMessage(null);
		setMessageError(false);
		try {
			const response = await fetch("/api/dashboard/api-key", { method: "POST" });
			const body = (await response.json().catch(() => ({}))) as {
				ok?: boolean;
				token?: unknown;
				key?: unknown;
			};
			if (response.status === 401) {
				setPhase("auth-required");
				setToken(null);
				return;
			}
			if (!response.ok || body.ok !== true || typeof body.token !== "string" || !body.token.trim() || !isApiKeyInfo(body.key)) {
				throw new Error("Could not confirm the key change. The server may have processed it; check key status before trying again. Any previously displayed key may no longer work.");
			}
			setKey(body.key);
			keyInfoRef.current = body.key;
			setToken(body.token);
			setMessage("Copy this key now. It will not be shown again.");
		} catch {
			setPhase("error");
			setMessageError(true);
			setMessage("Could not confirm the key change. The server may have processed it; check key status before trying again. Any previously displayed key may no longer work.");
		} finally {
			requestBusy.current = false;
			setAction(null);
		}
	}

	async function revoke(): Promise<void> {
		if (phase !== "ready" || !key || requestBusy.current) return;
		if (!window.confirm("Revoke this API key? Scripts and services using it will lose access immediately. This does not stop your machines or revoke provider keys.")) return;
		requestBusy.current = true;
		setAction("revoke");
		setMessage(null);
		setMessageError(false);
		try {
			const response = await fetch("/api/dashboard/api-key", { method: "DELETE" });
			const body = (await response.json().catch(() => ({}))) as { ok?: boolean };
			if (response.status === 401) {
				setPhase("auth-required");
				setToken(null);
				return;
			}
			if (!response.ok || body.ok !== true) throw new Error("Could not confirm revocation");
			setKey(null);
			keyInfoRef.current = null;
			setToken(null);
			setMessage("API key revoked.");
		} catch {
			setPhase("error");
			setMessageError(true);
			setMessage("Could not confirm revocation. The server may have processed it; check key status before trying again.");
		} finally {
			requestBusy.current = false;
			setAction(null);
		}
	}

	async function copyKey(): Promise<void> {
		if (!token || requestBusy.current || phase === "loading" || phase === "auth-required") return;
		requestBusy.current = true;
		setAction("copy");
		setMessage(null);
		setMessageError(false);
		try {
			await navigator.clipboard.writeText(token);
			setMessage("Key copied. Store it securely; it will not be shown after you leave this page.");
		} catch {
			setMessageError(true);
			setMessage("Clipboard access failed. Select and copy the displayed key manually before leaving this page.");
		} finally {
			requestBusy.current = false;
			setAction(null);
		}
	}

	const working = action !== null;
	const needsSignIn = phase === "auth-required";
	const status = phase === "loading" ? "Checking…" : needsSignIn ? "Sign-in required" : phase === "error" ? "Status unavailable" : key ? `${key.prefix}••••${key.lastFour}` : "No key yet";

	return (
		<Section
			id="developer-access"
			kicker="DEVELOPER API"
			title="Connect the Agent Machines SDK"
			description="Create a user-scoped key for scripts and servers. Keys are stored as hashes and can be rotated or revoked here."
		>
			<div className={cn("grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]")}>
				<div className={cn("flex min-h-28 flex-col justify-between border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-3")}>
					<div className={cn("flex items-center justify-between gap-3")}>
						<div>
							<p className={cn("text-sm font-medium text-[var(--ret-text-muted)]")}>
								API key
							</p>
							<p className={cn("mt-1 font-mono text-sm text-[var(--ret-text)]")}>
								{status}
							</p>
						</div>
						<ReticleBadge variant={phase === "ready" && key ? "success" : "default"}>
							{phase === "ready" ? key ? "Active" : "Not created" : "Not verified"}
						</ReticleBadge>
					</div>
					<div className={cn("mt-4 flex flex-wrap gap-2")}>
						{phase === "ready" ? <ReticleButton size="sm" onClick={() => void rotate()} disabled={working}>
							{action === "create" ? "Creating…" : action === "rotate" ? "Rotating…" : key ? "Rotate key" : "Create key"}
						</ReticleButton> : null}
						{phase === "ready" && key ? (
							<ReticleButton size="sm" variant="ghost" onClick={() => void revoke()} disabled={working}>
								{action === "revoke" ? "Revoking…" : "Revoke key"}
							</ReticleButton>
						) : null}
						{needsSignIn ? <a href="/sign-in?redirect_url=%2Fdashboard%2Fsettings" className={cn("inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--ret-border)] px-3 text-sm outline-none hover:bg-[var(--ret-surface)] focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]")}>Sign in to manage keys <ArrowRight size={16} aria-hidden="true" /></a> : null}
						{phase === "error" || needsSignIn ? <ReticleButton size="sm" variant="secondary" disabled={working} onClick={() => { if (!requestBusy.current) { requestBusy.current = true; setRefresh((value) => value + 1); } }}>Retry key status</ReticleButton> : null}
					</div>
				</div>
				<div className={cn("min-w-0 border border-[var(--ret-border)] bg-[var(--ret-bg)] p-3")}>
					{token && phase === "error" ? <p className={cn("mb-2 text-sm text-[var(--ret-text-muted)]")}>Previously displayed key · status unverified. Check its status before using it.</p> : null}
					{token && !needsSignIn ? (
						<div className={cn("mb-3 flex items-center gap-2")}>
							<code className={cn("min-w-0 flex-1 overflow-x-auto border border-[var(--ret-purple)]/40 bg-[var(--ret-purple)]/5 px-3 py-3 text-sm text-[var(--ret-text)]")}>
								{token}
							</code>
							<ReticleButton size="sm" variant="secondary" disabled={working || phase === "loading"} onClick={() => void copyKey()}>
								{action === "copy" ? "Copying…" : "Copy key"}
							</ReticleButton>
						</div>
					) : null}
					<pre className={cn("overflow-x-auto font-mono text-sm leading-relaxed text-[var(--ret-text-dim)]")}>{`export AGENT_MACHINES_URL=https://www.agent-machines.dev
export AGENT_MACHINES_API_KEY=your_account_api_key`}</pre>
					<p className={cn("mt-4 text-sm leading-6 text-[var(--ret-text-muted)]")}>This account key connects hosted SDK requests. It does not replace the compute and model keys above. Provisioning workspaces and running models can incur provider charges. <a href="/docs" className={cn("text-[var(--ret-text)] underline-offset-4 hover:underline")}>Read the SDK guide.</a></p>
					{needsSignIn ? <p role="status" className={cn("mt-3 text-sm leading-6 text-[var(--ret-text-muted)]")}>Sign in with Clerk to manage account API keys. Local development access does not grant permission to create keys.</p> : null}
					{phase === "error" && !message ? <p role="alert" className={cn("mt-3 text-sm leading-6 text-[var(--ret-text-muted)]")}>Could not check your API key. Retry before creating or changing a key.</p> : null}
					{message ? <p role={messageError ? "alert" : "status"} className={cn("mt-3 text-sm leading-6 text-[var(--ret-text-muted)]")}>{message}</p> : null}
				</div>
			</div>
		</Section>
	);
}
