import { LogsTail } from "@/components/dashboard/LogsTail";
import { PageHeader } from "@/components/dashboard/PageHeader";

export const dynamic = "force-dynamic";

export default function MachineLogsPage() {
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="LOGS -- ~/.agent-machines/logs/"
				title="Gateway tail"
				description="Inspect recent output and errors. Updates every 7 seconds."
			/>
			<LogsTail />
		</div>
	);
}
