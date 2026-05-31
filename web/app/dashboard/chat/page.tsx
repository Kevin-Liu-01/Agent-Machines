import { redirect } from "next/navigation";

import { resolveActiveMachineId } from "@/lib/dashboard/active-machine";

export const dynamic = "force-dynamic";

/**
 * Fleet-level "active machine" shortcut. Conversational surface is the
 * machine Console; send the user to the active machine's console, or to the
 * fleet listing when nothing is provisioned yet.
 */
export default async function DashboardChatRedirect() {
	const id = await resolveActiveMachineId();
	redirect(id ? `/dashboard/machines/${id}/console` : "/dashboard/machines");
}
