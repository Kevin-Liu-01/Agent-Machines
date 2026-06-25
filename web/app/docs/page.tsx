import { ResourcePageContent } from "@/components/marketing/ResourcePageContent";
import { resourcePageBySlug } from "@/lib/marketing/public-site";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
	title: "Documentation",
	description:
		"Agent Machines documentation for setup, provider credentials, runtimes, model paths, loadouts, logs, usage, cron, and artifacts.",
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
				"1. add provider credentials",
				"2. choose runtime and provider lane",
				"3. attach model path",
				"4. provision worker",
				"5. inspect logs, usage, artifacts",
			]}
		/>
	);
}
