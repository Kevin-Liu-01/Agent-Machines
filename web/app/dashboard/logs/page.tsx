import { LogsTail } from "@/components/dashboard/LogsTail";
import { PageHeader } from "@/components/dashboard/PageHeader";

export const dynamic = "force-dynamic";

export default function LogsPage() {
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="LOGS -- ~/.agent-machines/logs/"
				title="Gateway tail"
				description="Last 200 log lines off the live machine, polled every 7 seconds. Toggle Following to keep the tail glued to the bottom; pause to scroll back through earlier output. SSE streaming arrives in PR2.5."
			/>
			<LogsTail />
		</div>
	);
}
