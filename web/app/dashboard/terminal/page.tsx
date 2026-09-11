import { redirect } from "next/navigation";
import { MachineRequired } from "@/components/dashboard/MachineRequired";

import { resolveActiveMachineId } from "@/lib/dashboard/active-machine";

export const dynamic = "force-dynamic";

/** Fleet-level shortcut to the active machine's terminal. */
export default async function DashboardTerminalRedirect() {
	const id = await resolveActiveMachineId();
	if (id) redirect(`/dashboard/machines/${id}/terminal`);
	return <MachineRequired title="Terminal" description="Use the actual agent CLI or run a shell command on your selected machine." />;
}
