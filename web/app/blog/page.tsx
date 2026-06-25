import type { Metadata } from "next";

import { ResourcePageContent } from "@/components/marketing/ResourcePageContent";
import { resourcePageBySlug } from "@/lib/marketing/public-site";

export const metadata: Metadata = {
	title: "Blog",
	description:
		"Agent Machines engineering notes about persistent agents, runtime lanes, provider lanes, usage tracking, and fleet operations.",
	alternates: { canonical: "/blog" },
};

export default function BlogPage() {
	const page = resourcePageBySlug("blog");
	if (!page) throw new Error("Missing blog resource page data");
	return (
		<ResourcePageContent
			page={page}
			terminalLines={[
				"post: persistent workers",
				"post: provider lane matrix",
				"post: logs and usage tracking",
				"post: research agent loadouts",
				"status: publishing backlog",
			]}
		/>
	);
}
