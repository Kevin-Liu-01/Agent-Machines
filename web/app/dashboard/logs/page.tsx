import { redirect } from "next/navigation";

import { resolveActiveMachineId } from "@/lib/dashboard/active-machine";

export const dynamic = "force-dynamic";

/** Fleet-level shortcut to the active machine's logs. */
export default async function DashboardLogsRedirect() {
	const id = await resolveActiveMachineId();
	redirect(id ? `/dashboard/machines/${id}/logs` : "/dashboard/machines");
}
