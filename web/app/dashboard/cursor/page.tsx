import { redirect } from "next/navigation";
import { MachineRequired } from "@/components/dashboard/MachineRequired";

import { resolveActiveMachineId } from "@/lib/dashboard/active-machine";

export const dynamic = "force-dynamic";

/** Fleet-level shortcut to the active machine's Agents surface. */
export default async function DashboardCursorRedirect() {
	const id = await resolveActiveMachineId();
	if (id) redirect(`/dashboard/machines/${id}/agents`);
	return <MachineRequired title="Agent integrations" description="Manage agent integrations in your selected workspace." />;
}
