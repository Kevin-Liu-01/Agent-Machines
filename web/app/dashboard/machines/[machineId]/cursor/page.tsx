import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ machineId: string }> };

/** Cursor runs folded into the unified Agents surface. */
export default async function MachineCursorRedirect({ params }: Params) {
	const { machineId } = await params;
	redirect(`/dashboard/machines/${machineId}/agents`);
}
