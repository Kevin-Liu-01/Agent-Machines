import {
	DocList,
	DocListItem,
	DocSection,
	PublicDocPage,
} from "@/components/PublicDocPage";
import { FAQ, SITE } from "@/lib/seo/config";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
	title: "FAQ",
	description:
		"Common questions about Agent Machines, persistent workers, agent runtimes, sandbox providers, model routes, tools, skills, and machine data paths.",
	path: "/faq",
	keywords: ["Agent Machines FAQ", "persistent agent FAQ", "sandbox agent FAQ"],
});

export default function FaqPage() {
	return (
		<PublicDocPage
			kicker="FAQ"
			title="Common questions."
			description="Short answers about the current product state. The machine, agent, tools, provider lanes, and runtime boundaries stay explicit."
			badge={`${FAQ.length} answers`}
			aside={
				<div className="space-y-3">
					<p className="uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
						quick links
					</p>
					<DocList>
						<DocListItem>
							<a href="/#architecture" className="hover:text-[var(--ret-text)]">
								Architecture map
							</a>
						</DocListItem>
						<DocListItem>
							<a href="/#loadout" className="hover:text-[var(--ret-text)]">
								Tool loadout
							</a>
						</DocListItem>
						<DocListItem>
							<a href={SITE.githubUrl} className="hover:text-[var(--ret-text)]">
								Source repository
							</a>
						</DocListItem>
					</DocList>
				</div>
			}
		>
			<div className="mx-auto max-w-[920px]">
				{FAQ.map((item, index) => (
					<DocSection
						key={item.question}
						title={String(index + 1).padStart(2, "0")}
					>
						<h2 className="text-[17px] font-semibold tracking-tight text-[var(--ret-text)]">
							{item.question}
						</h2>
						<p>{item.answer}</p>
					</DocSection>
				))}
			</div>
		</PublicDocPage>
	);
}
