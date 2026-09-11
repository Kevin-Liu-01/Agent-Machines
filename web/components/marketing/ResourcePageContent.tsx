import { BookOpen, MessageSquare, Newspaper } from "@/components/ui/icons";
import { FlowSteps, LinkCard, MarketingHero, MarketingShell, ReticleSpacer, SectionBand, TerminalPanel } from "@/components/marketing/MarketingPage";
import { WorkerSystemThesis } from "@/components/WorkerSystemThesis";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { SITE } from "@/lib/seo/config";
import type { ResourcePage } from "@/lib/marketing/public-site";

type Props = { page: ResourcePage; terminalLines: ReadonlyArray<string>; terminalTitle?: string };

export function ResourcePageContent({ page, terminalLines, terminalTitle = "Configuration flow · illustration" }: Props) {
	const isContact = page.slug === "contact";
	const isBlog = page.slug === "blog";
	const isApi = page.slug === "api-reference";
	return <MarketingShell><main id="top">
		<MarketingHero kicker={page.eyebrow} title={isContact ? "How can we help?" : isBlog ? "From the workshop." : page.title} description={page.description} icon={page.icon}
			actions={isContact ? <ReticleButton as="a" href={`${SITE.githubUrl}/issues/new/choose`} size="lg" target="_blank" rel="noopener noreferrer">Open a support issue</ReticleButton> : isBlog ? <ReticleButton as="a" href="/docs" size="lg">Explore the docs</ReticleButton> : <>
				<ReticleButton as="a" href={isApi ? "/dashboard/settings" : "/dashboard/setup"} size="lg">{isApi ? "Manage API keys" : "Open guided setup"}</ReticleButton>
				<ReticleButton as="a" href={`${SITE.githubUrl}#readme`} target="_blank" rel="noopener noreferrer" variant="secondary" size="lg">Read the source guide</ReticleButton>
			</>}
			aside={isContact ? <div className="p-6"><MessageSquare className="mb-4 size-6" aria-hidden="true" /><h2 className="text-lg font-semibold">Help us reproduce it.</h2><ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--ret-text-dim)]"><li>What you expected and what happened.</li><li>The runtime, provider, and steps to reproduce.</li><li>A screenshot or redacted error message.</li></ul><p className="mt-5 border-t border-[var(--ret-border)]/40 pt-4 text-sm leading-6 text-[var(--ret-text-dim)]">GitHub issues are public. Do not include API keys, private files, or sensitive security details.</p></div> : isBlog ? <div className="p-6"><Newspaper className="mb-4 size-6 text-[var(--ret-text-muted)]" aria-hidden="true" /><h2 className="text-lg font-semibold">No posts published yet.</h2><p className="mt-3 text-sm leading-6 text-[var(--ret-text-dim)]">For now, explore the architecture, implementation, and product guides. These are the resources available today.</p></div> : <TerminalPanel title={terminalTitle} lines={terminalLines} className="h-full rounded-none border-0" />}
		/>
		<ReticleSpacer />
		{isBlog ? <SectionBand label="Read now" title="Go straight to the source."><div className="grid gap-4 md:grid-cols-3"><LinkCard href="/docs" title="Documentation" description="Setup paths, configuration, and current boundaries." icon="book" /><LinkCard href="/product" title="Inside the product" description="See the workspace, gear system, and supported controls." icon="layers" /><LinkCard href={`${SITE.githubUrl}/blob/main/docs/WHITEPAPER.md`} title="Architecture paper" description="The Worker model, replaceable components, and product direction." icon="file" /></div></SectionBand> : <>
			<SectionBand label={isContact ? "Before you ask" : "Choose your path"} title={isContact ? "Find a quick answer." : isApi ? "Direct SDK or hosted API?" : "Configure in the app. Extend in code."}>
				{isContact ? <div className="grid gap-4 md:grid-cols-3"><LinkCard href="/faq" title="Common questions" description="Current support, costs, and provider limitations." icon="message" /><LinkCard href="/docs" title="Setup help" description="Connect your accounts and configure a first Worker." icon="book" /><LinkCard href="/product/isolation" title="Security boundaries" description="Review credential handling and machine isolation." icon="shield" /></div> : <FlowSteps steps={page.sections} />}
			</SectionBand>
			{!isContact ? <>
				<ReticleSpacer />
				<SectionBand label="Next step" title={isApi ? "Connect a client." : "Open the part you need."}><div className="grid gap-4 md:grid-cols-3">
					{isApi ? <>
						<LinkCard href={`${SITE.githubUrl}#readme`} title="Direct SDK guide" description="Install the TypeScript SDK and supply provider dependencies and credentials." icon="code" />
						<LinkCard href="/dashboard/settings" title="Hosted API keys" description="Create or manage account keys. Hosted endpoints require authentication." icon="key" />
						<LinkCard href="/dashboard/usage" title="Inspect usage" description="Review recorded activity. Missing measurements are not a zero-cost result." icon="activity" />
					</> : <>
						<LinkCard href="/dashboard/memory" title="Edit instructions" description="Write the role, rules, and context your agent needs." icon="database" />
						<LinkCard href="/dashboard/registry" title="Connect tools" description="Review entries, installation commands, and service requirements." icon="boxes" />
						<LinkCard href="/dashboard/settings" title="Connect providers" description="Supply your own model and compute credentials before launch." icon="key" />
					</>}
				</div><p className="mt-5 flex items-start gap-2 text-sm leading-6 text-[var(--ret-text-muted)]"><BookOpen className="mt-1 size-4 shrink-0" aria-hidden="true" />Dashboard actions require an account. Provider capabilities, credentials, and charges still apply.</p></SectionBand>
			</> : null}
		</>}
		{page.slug === "docs" ? <><ReticleSpacer /><WorkerSystemThesis /></> : null}
		<ReticleSpacer />
	</main></MarketingShell>;
}
