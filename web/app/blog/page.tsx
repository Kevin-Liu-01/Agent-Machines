import { ResourcePageContent } from "@/components/marketing/ResourcePageContent";
import { resourcePageBySlug } from "@/lib/marketing/public-site";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
	title: "Blog",
	description:
		"Agent Machines engineering notes about persistent agents, runtime routing, sandbox routing, usage tracking, loadouts, and fleet operations.",
	path: "/blog",
	keywords: ["agent engineering", "persistent agents", "AI infrastructure blog"],
});

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
