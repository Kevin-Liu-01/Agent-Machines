import { ResourcePageContent } from "@/components/marketing/ResourcePageContent";
import { resourcePageBySlug } from "@/lib/marketing/public-site";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
	title: "API Reference",
	description:
		"Agent Machines SDK exports and hosted endpoint map for creating agents, streaming runs, configuring Workers, and inspecting operations.",
	path: "/api-reference",
	keywords: ["Agent Machines API", "agent SDK", "worker API", "agent run API"],
});

export default function ApiReferencePage() {
	const page = resourcePageBySlug("api-reference");
	if (!page) throw new Error("Missing API reference resource page data");
	return (
		<ResourcePageContent
			page={page}
			terminalTitle="hosted endpoint examples · authentication required"
			terminalLines={[
				"POST /api/dashboard/control-plane/workers",
				"GET /api/dashboard/machines",
				"POST /api/agents/run",
				"GET /api/dashboard/control-plane/operations/:id",
				"GET /api/dashboard/logs",
				"GET /api/dashboard/metrics/usage",
				"GET /api/dashboard/machines/:id",
			]}
		/>
	);
}
