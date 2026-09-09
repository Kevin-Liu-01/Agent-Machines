import { redirect } from "next/navigation";

import { OnboardingFlow } from "@/components/dashboard/OnboardingFlow";
import { ClerkAppProvider } from "@/components/ClerkAppProvider";
import { listPresets } from "@/lib/dashboard/presets";
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

	// Already provisioned -- skip onboarding unless ?force=1.
	if (!force && config.machines.some((m) => !m.archived)) {
		redirect("/dashboard");
	}

	return (
		<ClerkAppProvider>
			<OnboardingFlow
				initialConfig={toPublicConfig(config)}
				presets={listPresets()}
			/>
		</ClerkAppProvider>
	);
}
