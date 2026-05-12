import type { Metadata } from "next";

import {
	DocList,
	DocListItem,
	DocSection,
	PublicDocPage,
} from "@/components/PublicDocPage";
import { LEGAL_EFFECTIVE_DATE, SITE } from "@/lib/seo/config";

export const metadata: Metadata = {
	title: "Privacy Policy",
	description:
		"Privacy policy for Agent Machines, including account data, provider keys, machine data, artifacts, and third-party services.",
	alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
	return (
		<PublicDocPage
			kicker="PRIVACY"
			title="Privacy Policy."
			description="This page explains what Agent Machines stores, where it lives, and which third-party services may process it. Tiny goblin footnote: the machine is durable, so delete what you do not want preserved."
			badge={`effective ${LEGAL_EFFECTIVE_DATE}`}
			aside={
				<div className="space-y-3">
					<p className="uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
						data boundary
					</p>
					<p>
						Provider credentials live in Clerk private metadata. Agent files
						live on the selected provider machine under /home/machine.
					</p>
				</div>
			}
		>
			<div className="mx-auto max-w-[920px]">
				<DocSection title="data collected">
					<DocList>
						<DocListItem>
							Account data from Clerk, such as user id, email, and session
							state.
						</DocListItem>
						<DocListItem>
							UserConfig data, including provider status, machine refs, active
							machine id, draft setup choices, and redacted public status.
						</DocListItem>
						<DocListItem>
							Provider credentials and gateway bearers stored in Clerk private
							metadata.
						</DocListItem>
						<DocListItem>
							Machine data stored under /home/machine, including chats,
							artifacts, agent runtime files, sessions, logs, skills, and crons.
						</DocListItem>
					</DocList>
				</DocSection>

				<DocSection title="where data lives">
					<p>
						Clerk stores auth data and private metadata. Vercel hosts the web
						app. Dedalus hosts live provider machines today. Cloudflare may
						carry preview tunnel traffic. Cursor processes delegated code tasks
						only when you configure CURSOR_API_KEY and call cursor-bridge.
					</p>
					<p>
						Inside the machine, ~/.agent-machines stores all agent
						state -- runtime data, app data, skills, sessions, crons, and
						config. /home/machine/agent-machines stores the git checkout
						used for reloads.
					</p>
				</DocSection>

				<DocSection title="how data is used">
					<DocList>
						<DocListItem>
							Authenticate you and route you to your dashboard.
						</DocListItem>
						<DocListItem>
							Provision, wake, sleep, inspect, and select machines.
						</DocListItem>
						<DocListItem>
							Proxy chat requests without exposing gateway bearers to browser
							JavaScript.
						</DocListItem>
						<DocListItem>
							Display artifacts, sessions, logs, skills, MCP tools, and machine
							status back to you.
						</DocListItem>
					</DocList>
				</DocSection>

				<DocSection title="sharing">
					<p>
						Agent Machines does not sell personal data. Data is shared with
						service providers only as needed to run the product, host machines,
						authenticate users, route requests, or execute tools you invoke.
					</p>
					<p>
						Model providers and tool providers may receive prompts, files,
						screenshots, or metadata when your agent calls them. Their terms and
						policies apply.
					</p>
				</DocSection>

				<DocSection title="retention">
					<p>
						Clerk metadata remains until removed or your account is deleted.
						Machine data remains on the selected provider machine until you
						delete files, archive the machine, or destroy the machine.
					</p>
				</DocSection>

				<DocSection title="control">
					<DocList>
						<DocListItem>
							Delete artifacts and files from the machine when you no longer
							need them.
						</DocListItem>
						<DocListItem>
							Remove provider keys from setup when you stop using a provider.
						</DocListItem>
						<DocListItem>
							Destroy provider machines when you want their disks removed by
							that provider.
						</DocListItem>
						<DocListItem>
							Open a GitHub issue for account-level deletion requests.
						</DocListItem>
					</DocList>
				</DocSection>

				<DocSection title="security">
					<p>
						The dashboard keeps provider credentials server-side. Gateway
						bearers are proxied by API routes and are not shipped as
						NEXT_PUBLIC values. No system is perfect; do not store secrets on a
						machine unless the selected provider is acceptable for that use.
					</p>
				</DocSection>

				<DocSection title="contact">
					<p>
						Questions or corrections should go through{" "}
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
