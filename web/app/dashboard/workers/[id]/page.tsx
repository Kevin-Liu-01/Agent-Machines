import { WorkerDetail } from "@/components/dashboard/WorkerDetail";

export const dynamic = "force-dynamic";

export default async function WorkerPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <WorkerDetail workerId={id} />;
}
