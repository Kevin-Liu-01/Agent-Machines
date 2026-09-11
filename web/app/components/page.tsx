import Link from "next/link";
import { Code2, FolderKanban, ArrowUpRight } from "@/components/ui/icons";
import { HarnessComponentGrid } from "@/components/marketing/HarnessComponents";
import { MarketingHero, MarketingShell } from "@/components/marketing/MarketingPage";
import { ReticleSection } from "@/components/reticle/ReticleSection";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { harnessSourceHref } from "@/lib/marketing/harness-primitives";

const SOURCE_LAYERS = [
	{ label: "Runtime & provider adapters", path: "src/mux" },
	{ label: "Lifecycle kernel", path: "src/control-plane" },
	{ label: "Dashboard & configuration", path: "web/app/dashboard" },
	{ label: "Skill instructions", path: "knowledge/skills" },
];

function SourceMap() {
	return <aside className="flex h-full flex-col justify-center p-6 md:p-8" aria-label="Repository map">
		<p className="mb-6 flex items-center gap-2 text-sm font-medium"><Code2 className="size-5" aria-hidden="true" />Not a black box</p>
		<div className="space-y-3">{SOURCE_LAYERS.map((layer) => <a key={layer.path} href={harnessSourceHref(layer.path)} className="group flex items-center gap-3 rounded-md border border-[var(--ret-border)] bg-[var(--ret-bg)] p-4 transition-colors hover:border-[var(--ret-text-muted)] motion-reduce:transition-none" target="_blank" rel="noopener noreferrer"><FolderKanban className="size-5 shrink-0 text-[var(--ret-text-dim)]" aria-hidden="true" /><span className="min-w-0"><span className="block text-sm font-medium">{layer.label}</span><code className="mt-1 block break-all text-xs text-[var(--ret-text-muted)]">{layer.path}</code></span><ArrowUpRight className="ml-auto size-4 shrink-0 text-[var(--ret-text-muted)]" aria-hidden="true" /></a>)}</div>
		<p className="mt-6 text-sm leading-relaxed text-[var(--ret-text-dim)]">Use the SDK. Read the implementation. Fork the app when you need different wiring.</p>
	</aside>;
}

export const metadata = buildPageMetadata({ title: "Agent harness building blocks", description: "Explore the runtime adapters, sandbox providers, tools, memory documents, and browser terminals behind Agent Machines. Inspect the source and configure your own setup.", path: "/components" });

export default function ComponentsPage() {
	return <MarketingShell><main>
		<MarketingHero kicker="Building blocks" title="Start with working parts. Make them yours." icon="boxes" description="A foundation for building your own agent harness: runtime and provider adapters, editable instructions, tools, and a remote workspace. Configure them in the dashboard or extend the MIT-licensed source." badges={["Open source", "Configurable", "Real agent CLIs"]} aside={<SourceMap />} actions={<><ReticleButton as="a" href="/dashboard/agents" size="lg">Choose a starting setup</ReticleButton><ReticleButton as="a" href="https://github.com/Kevin-Liu-01/Agent-Machines" variant="secondary" size="lg">Explore the source</ReticleButton></>} />
		<ReticleSection contentClassName="px-5 pb-12 md:px-8"><HarnessComponentGrid /></ReticleSection>
		<ReticleSection contentClassName="px-5 py-12 md:px-8">
			<div className="grid gap-10 md:grid-cols-2">
				<div><h2 className="text-2xl font-semibold tracking-tight">The shadcn idea, applied to harnesses.</h2><p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--ret-text-dim)]">Start from useful code, understand how it works, and adapt it to your workflow. That is the design principle—not a claim that this ships as a shadcn registry, a React component package, or a one-command harness installer.</p></div>
				<div><h2 className="text-2xl font-semibold tracking-tight">Configure, then verify.</h2><p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--ret-text-dim)]">A starter saves runtime suggestions, instructions, and selected abilities. It does not launch compute or authenticate tools. Connect your accounts, review the setup, launch a machine, and check the result in its terminal and files.</p><Link className="mt-5 inline-block text-sm underline underline-offset-4" href="/docs">Read the setup guide</Link></div>
			</div>
			<p className="mt-10 border-t border-[var(--ret-border)] pt-6 text-sm leading-relaxed text-[var(--ret-text-muted)]">Today you can fork the code, reuse SDK configuration, and export memory documents as Markdown. Full harness import/export, public publishing, and a setup marketplace are not available yet.</p>
		</ReticleSection>
	</main></MarketingShell>;
}
