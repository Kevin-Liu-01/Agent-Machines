import { ResourcePageContent } from "@/components/marketing/ResourcePageContent";
import { resourcePageBySlug } from "@/lib/marketing/public-site";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
	title: "Documentation",
	description:
		"Agent Machines system thesis and documentation for durable Workers, replaceable runtimes and sandboxes, templates, lifecycle, live migration, supervision, and operations.",
	path: "/docs",
	keywords: ["Agent Machines docs", "agent setup", "provider credentials"],
});

export default function DocsPage() {
	const page = resourcePageBySlug("docs");
	if (!page) throw new Error("Missing docs resource page data");
	return (
		<ResourcePageContent
			page={page}
			terminalLines={[
				"1. describe the work or choose a specialist",
				"2. connect the services it may use",
				"3. assign responsibility and approval boundaries",
				"4. let the control plane assemble the machinery",
				"5. watch, approve, inspect, and move the Worker",
			]}
		/>
	);
}
