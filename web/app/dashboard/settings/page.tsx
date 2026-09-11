import { PageHeader } from "@/components/dashboard/PageHeader";
import { SettingsPanel } from "@/components/dashboard/SettingsPanel";
import { getUserConfigForRequest } from "@/lib/user-config/clerk";
import { toPublicConfig } from "@/lib/user-config/schema";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
	const config = await getUserConfigForRequest();
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="Settings"
				title="Accounts and defaults"
				description="Connect accounts, manage API keys, and set workspace defaults."
			/>
			<SettingsPanel initialConfig={toPublicConfig(config)} />
		</div>
	);
}
