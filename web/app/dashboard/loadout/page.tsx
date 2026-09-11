import { redirect } from "next/navigation";
import { MachineRequired } from "@/components/dashboard/MachineRequired";

import { resolveActiveMachineId } from "@/lib/dashboard/active-machine";

export const dynamic = "force-dynamic";

/** Fleet-level shortcut to the active machine's loadout. */
export default async function DashboardLoadoutRedirect() {
	const id = await resolveActiveMachineId();
	if (id) redirect(`/dashboard/machines/${id}/loadout`);
	return <MachineRequired title="Loadout" description="Choose and install tools for a specific runtime and machine." />;
}
