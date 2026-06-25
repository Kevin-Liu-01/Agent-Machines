import { ResourcePageContent } from "@/components/marketing/ResourcePageContent";
import { resourcePageBySlug } from "@/lib/marketing/public-site";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
	title: "Contact",
	description:
		"Contact Agent Machines about provider setup, production agent workers, security boundaries, templates, and onboarding.",
	path: "/contact",
	keywords: ["Agent Machines contact", "agent onboarding", "production agent workers"],
});

export default function ContactPage() {
	const page = resourcePageBySlug("contact");
	if (!page) throw new Error("Missing contact resource page data");
	return (
		<ResourcePageContent
			page={page}
			terminalLines={[
				"github: Kevin-Liu-01/agent-machines",
				"scope: provider setup",
				"scope: runtime and loadout design",
				"scope: observability and usage",
				"scope: security review",
			]}
		/>
	);
}
