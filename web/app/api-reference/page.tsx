import type { Metadata } from "next";

import { ResourcePageContent } from "@/components/marketing/ResourcePageContent";
import { resourcePageBySlug } from "@/lib/marketing/public-site";

export const metadata: Metadata = {
	title: "API Reference",
	description:
		"Agent Machines API reference notes for machine records, gateway calls, lifecycle routes, logs, metrics, and artifacts.",
	alternates: { canonical: "/api-reference" },
};

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
