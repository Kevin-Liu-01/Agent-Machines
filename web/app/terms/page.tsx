import type { Metadata } from "next";

import {
	DocList,
	DocListItem,
	DocSection,
	PublicDocPage,
} from "@/components/PublicDocPage";
import { LEGAL_EFFECTIVE_DATE, SITE } from "@/lib/seo/config";

export const metadata: Metadata = {
	title: "Terms of Service",
	description:
		"Terms for using Agent Machines, a persistent machine runtime for agents.",
	alternates: { canonical: "/terms" },
};

export default function TermsPage() {
	return (
		<PublicDocPage
			kicker="TERMS"
			title="Terms of Service."
			description="These terms cover the public site, dashboard, CLI, and hosted Agent Machines workflows. The short version: bring keys you are allowed to use, do not abuse the machine, and understand which providers actually run each layer."
			badge={`effective ${LEGAL_EFFECTIVE_DATE}`}
			aside={
				<div className="space-y-3">
					<p className="uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
						current status
					</p>
					<p>
						Dedalus Machines is wired today. E2B Sandbox and Fly Machines
						are available as alternative providers.
					</p>
				</div>
			}
		>
			<div className="mx-auto max-w-[920px]">
				<DocSection title="service">
					<p>
						Agent Machines provides software for running persistent agent
						runtimes on provider machines. The service includes this site, the
						Clerk-gated dashboard, the repository, and the CLI.
					</p>
					<p>
						The project is open source under the MIT license. Hosted usage may
						depend on third-party services, including Clerk, Vercel, Dedalus,
						Cloudflare, Cursor, Fly, and model providers.
					</p>
				</DocSection>

				<DocSection title="accounts">
					<DocList>
						<DocListItem>
							You must control the account and credentials you connect.
						</DocListItem>
						<DocListItem>
							You are responsible for activity from your account.
						</DocListItem>
						<DocListItem>
							You must keep provider keys and gateway bearers private.
						</DocListItem>
					</DocList>
				</DocSection>

				<DocSection title="machine use">
					<DocList>
						<DocListItem>
							Do not use machines for illegal, abusive, or harmful activity.
						</DocListItem>
						<DocListItem>
							Do not attack, scrape abusively, spam, mine crypto, or bypass
							third-party service limits.
						</DocListItem>
						<DocListItem>
							Do not upload data you lack permission to process.
						</DocListItem>
						<DocListItem>
							Follow the terms of every provider, model API, and tool you use.
						</DocListItem>
					</DocList>
				</DocSection>

				<DocSection title="your content">
					<p>
						You keep rights to content you upload, create, or process through
						your machine. You grant Agent Machines the limited permission needed
						to operate the dashboard, route requests, store configuration, and
						display machine data back to you.
					</p>
					<p>
						Your machine may generate files, logs, artifacts, and memory. You
						are responsible for reviewing generated output before relying on it.
					</p>
				</DocSection>

				<DocSection title="providers">
					<p>
						Agent Machines coordinates third-party providers. It does not
						control their uptime, pricing, safety systems, quotas, model output,
						or data handling.
					</p>
					<p>
						Provider charges are your responsibility when you bring your own
						keys. Sleep and wake behavior depends on the selected provider.
					</p>
				</DocSection>

				<DocSection title="availability">
					<p>
						The service is provided as-is. Machines, previews, tunnels,
						dashboards, and model calls may fail, restart, sleep, or disappear.
						Back up anything important.
					</p>
				</DocSection>

				<DocSection title="changes">
					<p>
						These terms may change as the product changes. Continued use after a
						change means you accept the updated terms.
					</p>
					<p>
						Questions or fixes should go through{" "}
						<a
							href={SITE.githubUrl}
							className="text-[var(--ret-purple)] hover:underline"
						>
							the GitHub repository
						</a>
						.
					</p>
				</DocSection>
			</div>
		</PublicDocPage>
	);
}
