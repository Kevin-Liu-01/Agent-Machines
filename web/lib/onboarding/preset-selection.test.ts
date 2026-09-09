import { describe, expect, it } from "vitest";
import { listPresets } from "@/lib/dashboard/presets";
import { AGENT_TEMPLATES } from "@/lib/marketing/public-site";
import { safeAuthReturnTo, signInCleanupRedirect } from "@/lib/auth/redirects";
import { presetDestination, selectedPreset, workerPresetSeed } from "./preset-selection";

const presets = listPresets();

describe("public catalog to Worker setup", () => {
	it.each(AGENT_TEMPLATES.map((template) => [template.slug]))("keeps the real %s preset through the auth and library handoffs", (slug) => {
		const onboarding = presetDestination("/onboarding", presets, slug);
		const returnUrl = safeAuthReturnTo(onboarding);
		expect(returnUrl).toBe(`/onboarding?preset=${slug}`);
		expect(signInCleanupRedirect({ redirect_url: returnUrl! })).toBeNull();
		const requested = new URL(returnUrl!, "https://app.example").searchParams.get("preset");
		const preset = selectedPreset(presets, requested);
		expect(preset?.id).toBe(slug);
		expect(preset?.rolePrompt).toBeTruthy();
		const library = presetDestination("/dashboard/agents", presets, requested);
		const libraryId = new URL(library, "https://app.example").searchParams.get("preset");
		expect(workerPresetSeed(presets, libraryId)).toEqual({ name: preset!.name, sourceValue: `preset:${slug}` });
	});
	it.each(["missing", "../coding-agent", "CODING-AGENT", ["coding-agent"], null, undefined])("falls back without silently selecting an unrelated preset: %j", (input) => {
		expect(selectedPreset(presets, input)).toBeNull();
		expect(presetDestination("/onboarding", presets, input)).toBe("/onboarding");
		expect(presetDestination("/dashboard/agents", presets, input)).toBe("/dashboard/agents");
		expect(workerPresetSeed(presets, input)).toBeNull();
	});
});
