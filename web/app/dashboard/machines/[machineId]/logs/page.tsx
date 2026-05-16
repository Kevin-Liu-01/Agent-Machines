import { LogsTail } from "@/components/dashboard/LogsTail";
import { PageHeader } from "@/components/dashboard/PageHeader";

export const dynamic = "force-dynamic";

export default function MachineLogsPage() {
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="LOGS -- ~/.agent-machines/logs/"
				title="Gateway tail"
				description="Last 200 log lines off this machine, polled every 7 seconds."
			/>
			<LogsTail />
		</div>
	);
}
