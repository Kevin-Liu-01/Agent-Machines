import { redirect } from "next/navigation";
import { MachineRequired } from "@/components/dashboard/MachineRequired";

import { resolveActiveMachineId } from "@/lib/dashboard/active-machine";

export const dynamic = "force-dynamic";

/** Fleet-level shortcut to the active machine's logs. */
export default async function DashboardLogsRedirect() {
	const id = await resolveActiveMachineId();
	if (id) redirect(`/dashboard/machines/${id}/logs`);
	return <MachineRequired title="Logs" description="Inspect runtime output and errors from your selected machine." />;
}
