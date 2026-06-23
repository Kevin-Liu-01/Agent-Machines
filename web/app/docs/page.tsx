import type { Metadata } from "next";

import { ResourcePageContent } from "@/components/marketing/ResourcePageContent";
import { resourcePageBySlug } from "@/lib/marketing/public-site";

export const metadata: Metadata = {
	title: "Documentation",
	description:
		"Agent Machines documentation for setup, provider credentials, runtimes, model routes, loadouts, logs, usage, cron, and artifacts.",
	alternates: { canonical: "/docs" },
};

export default function DocsPage() {
	const page = resourcePageBySlug("docs");
	if (!page) throw new Error("Missing docs resource page data");
	return (
		<ResourcePageContent
			page={page}
			terminalLines={[
				"1. add provider credentials",
				"2. choose runtime and provider lane",
				"3. attach model route",
				"4. provision worker",
				"5. inspect logs, usage, artifacts",
			]}
		/>
	);
}
