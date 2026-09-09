import type { Preset } from "@/lib/dashboard/presets";

/** URL input can select only a real catalog entry, never an arbitrary loadout. */
export function selectedPreset(presets: readonly Preset[], requested: unknown): Preset | null {
	return typeof requested === "string" ? presets.find((preset) => preset.id === requested) ?? null : null;
}

export function presetDestination(path: "/onboarding" | "/dashboard/agents", presets: readonly Preset[], requested: unknown): string {
	const preset = selectedPreset(presets, requested);
	return preset ? `${path}?${new URLSearchParams({ preset: preset.id })}` : path;
}

export function workerPresetSeed(presets: readonly Preset[], requested: unknown) {
	const preset = selectedPreset(presets, requested);
	return preset ? { name: preset.name, sourceValue: `preset:${preset.id}` } : null;
}
