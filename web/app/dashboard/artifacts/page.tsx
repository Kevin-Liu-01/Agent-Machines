import { redirect } from "next/navigation";

import { resolveActiveMachineId } from "@/lib/dashboard/active-machine";

export const dynamic = "force-dynamic";

/** Fleet-level shortcut to the active machine's artifacts. */
export default async function DashboardArtifactsRedirect() {
	const id = await resolveActiveMachineId();
	redirect(id ? `/dashboard/machines/${id}/artifacts` : "/dashboard/machines");
}
