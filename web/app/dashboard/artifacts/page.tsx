import { redirect } from "next/navigation";
import { MachineRequired } from "@/components/dashboard/MachineRequired";

import { resolveActiveMachineId } from "@/lib/dashboard/active-machine";

export const dynamic = "force-dynamic";

/** Fleet-level shortcut to the active machine's artifacts. */
export default async function DashboardArtifactsRedirect() {
	const id = await resolveActiveMachineId();
	if (id) redirect(`/dashboard/machines/${id}/artifacts`);
	return <MachineRequired title="Artifacts" description="Preview, download, and manage the files produced on your selected machine." />;
}
