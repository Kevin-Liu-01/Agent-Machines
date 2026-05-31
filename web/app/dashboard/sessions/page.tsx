import { redirect } from "next/navigation";

import { resolveActiveMachineId } from "@/lib/dashboard/active-machine";

export const dynamic = "force-dynamic";

/** Fleet-level shortcut to the active machine's sessions. */
export default async function DashboardSessionsRedirect() {
	const id = await resolveActiveMachineId();
	redirect(id ? `/dashboard/machines/${id}/sessions` : "/dashboard/machines");
}
