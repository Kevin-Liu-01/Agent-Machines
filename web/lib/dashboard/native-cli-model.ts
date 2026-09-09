import { runtimeModel } from "@/lib/agents/runtime-model";

export type NativeCliKind = "claude-code" | "codex";

export function shellArgument(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`;
}

/** Durable, provider-portable selection shared by bootstrap and terminal restores. */
export function nativeCliModelFilename(kind: NativeCliKind): string {
	return `${kind}-model`;
}

/**
 * Resolve a model as data, never executable shell. Old Workers fall back to their
 * existing settings.json; newly configured Workers have a dedicated state file.
 * Leaves the normalized selection in $am_cli_model for a quoted --model argument.
 */
export function nativeCliModelSetup(kind: NativeCliKind, requested?: string | null): string {
	const envName = kind === "claude-code" ? "AM_CLAUDE_CODE_MODEL" : "AM_CODEX_MODEL";
	const prefix = kind === "claude-code" ? "anthropic/" : "openai/";
	const validPattern = kind === "claude-code" ? "claude-*" : "gpt-*|o[0-9]*";
	const selected = requested?.trim() ? `am_cli_model=${shellArgument(runtimeModel(kind, requested))}` : [
		`am_cli_model="$(cat "$HOME/.agent-machines/state/${nativeCliModelFilename(kind)}" 2>/dev/null || true)"`,
		`if [ -z "$am_cli_model" ]; then am_cli_model="\${${envName}:-}"; fi`,
		`if [ -z "$am_cli_model" ]; then`,
		`  am_cli_model="$(node -e 'try { const s = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); if (s.agentKind === process.argv[2] && typeof s.model === "string") process.stdout.write(s.model.trim()); } catch {}' "$HOME/.agent-machines/settings.json" ${shellArgument(kind)} 2>/dev/null || true)"`,
		`fi`,
	].join("\n");
	return [
		selected,
		`case "$am_cli_model" in ${prefix}*) am_cli_model="\${am_cli_model#${prefix}}" ;; esac`,
		`case "$am_cli_model" in ${validPattern}) ;; *) am_cli_model=${shellArgument(runtimeModel(kind))} ;; esac`,
	].join("\n");
}
