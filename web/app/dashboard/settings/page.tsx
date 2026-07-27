import { PageHeader } from "@/components/dashboard/PageHeader";
import { SettingsPanel } from "@/components/dashboard/SettingsPanel";
import { getUserConfig } from "@/lib/user-config/clerk";
import { toPublicConfig } from "@/lib/user-config/schema";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
	const config = await getUserConfig();
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="SETTINGS"
				title="Make it yours"
				description="Connect the SDK, choose machine defaults, and add provider keys. Advanced recipes stay out of the way until you need them."
			/>
			<SettingsPanel initialConfig={toPublicConfig(config)} />
		</div>
	);
}
