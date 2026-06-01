import { MemoryBundleEditor } from "@/components/dashboard/MemoryBundleEditor";

export const dynamic = "force-dynamic";

export default async function MemoryBundlePage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <MemoryBundleEditor bundleId={id} />;
}
