import type { Metadata } from "next";

import { ResourcePageContent } from "@/components/marketing/ResourcePageContent";
import { resourcePageBySlug } from "@/lib/marketing/public-site";

export const metadata: Metadata = {
	title: "Contact",
	description:
		"Contact Agent Machines about provider setup, production agent workers, security boundaries, templates, and onboarding.",
	alternates: { canonical: "/contact" },
};

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
