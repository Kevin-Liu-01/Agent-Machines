import { ResourcePageContent } from "@/components/marketing/ResourcePageContent";
import { resourcePageBySlug } from "@/lib/marketing/public-site";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
	title: "API Reference",
	description:
		"Agent Machines API reference for worker records, SDK runs, gateway calls, lifecycle lanes, logs, metrics, usage, and artifacts.",
	path: "/api-reference",
	keywords: ["Agent Machines API", "agent SDK", "worker API", "agent run API"],
});

export default function ApiReferencePage() {
	const page = resourcePageBySlug("api-reference");
	if (!page) throw new Error("Missing API reference resource page data");
	return (
		<ResourcePageContent
			page={page}
			terminalLines={[
				"GET /api/dashboard/machines",
				"POST /api/dashboard/gateway",
				"GET /api/dashboard/logs",
				"GET /api/dashboard/metrics/usage",
				"GET /api/dashboard/machines/:id",
			]}
		/>
	);
}
