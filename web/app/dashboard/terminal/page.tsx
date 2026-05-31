import { redirect } from "next/navigation";

import { resolveActiveMachineId } from "@/lib/dashboard/active-machine";

export const dynamic = "force-dynamic";

/** Fleet-level shortcut to the active machine's terminal. */
export default async function DashboardTerminalRedirect() {
	const id = await resolveActiveMachineId();
	redirect(id ? `/dashboard/machines/${id}/terminal` : "/dashboard/machines");
}
