import { redirect } from "next/navigation";

/**
 * Chat folded into Console. The 3-panel agent console (which streams through
 * the same gateway) is now the single conversational surface per machine.
 */
export default async function MachineChatPage({
	params,
}: {
	params: Promise<{ machineId: string }>;
}) {
	const { machineId } = await params;
	redirect(`/dashboard/machines/${machineId}/console`);
}
