import { redirect } from "next/navigation";

import { resolveActiveMachineId } from "@/lib/dashboard/active-machine";

export const dynamic = "force-dynamic";

/** Fleet-level shortcut to the active machine's loadout. */
export default async function DashboardLoadoutRedirect() {
	const id = await resolveActiveMachineId();
	redirect(id ? `/dashboard/machines/${id}/loadout` : "/dashboard/machines");
}
