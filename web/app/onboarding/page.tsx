import { redirect } from "next/navigation";

import { OnboardingFlow } from "@/components/dashboard/OnboardingFlow";
import { ClerkAppProvider } from "@/components/ClerkAppProvider";
import { listPresets } from "@/lib/dashboard/presets";
import { presetDestination, selectedPreset } from "@/lib/onboarding/preset-selection";
import { getUserConfig } from "@/lib/user-config/clerk";
import { toPublicConfig } from "@/lib/user-config/schema";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const params = await searchParams;
	const config = await getUserConfig();
	const force = params?.force === "1";
	const presets = listPresets();
	const preset = selectedPreset(presets, params.preset);

	// Already provisioned -- skip onboarding unless ?force=1.
	if (!force && config.machines.some((m) => !m.archived)) {
		redirect(preset ? presetDestination("/dashboard/agents", presets, preset.id) : "/dashboard");
	}

	return (
		<ClerkAppProvider>
			<OnboardingFlow
				key={preset?.id ?? "default"}
				initialConfig={toPublicConfig(config)}
				presets={presets}
				initialPresetId={preset?.id}
			/>
		</ClerkAppProvider>
	);
}
