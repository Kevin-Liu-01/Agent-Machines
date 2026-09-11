import { ResourcePageContent } from "@/components/marketing/ResourcePageContent";
import { resourcePageBySlug } from "@/lib/marketing/public-site";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
	title: "Documentation",
	description:
		"Guides and source for modular agent harnesses: runtime and compute adapters, editable setups, memory documents, tools, native terminals, and the TypeScript SDK.",
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
				"1. inspect a template or the SDK source",
				"2. choose runtime, model, and compute",
				"3. edit persona, instructions, and context",
				"4. configure tools and scoped service keys",
				"5. run, inspect output, and refine your setup",
			]}
		/>
	);
}
