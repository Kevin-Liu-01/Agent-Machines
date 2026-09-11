import Link from "next/link";
import { ArrowRight, Code2, Layers } from "@/components/ui/icons";
import { Logo } from "@/components/Logo";
import { PublicIcon } from "@/components/marketing/PublicIcon";
import { HARNESS_PRIMITIVES, harnessSourceHref } from "@/lib/marketing/harness-primitives";
import { LANDING_INSET } from "@/lib/marketing/layout";
import { cn } from "@/lib/cn";

export function HarnessComponentGrid({ dashboard = false }: { dashboard?: boolean }) {
	return (
		<div className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-3")} data-harness-components>
			{HARNESS_PRIMITIVES.map((block) => (
				<article key={block.id} id={block.id} className={cn("group flex min-w-0 flex-col rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-5 transition-colors duration-200 hover:border-[var(--ret-text-muted)] motion-reduce:transition-none md:p-6")}>
					<div className={cn("mb-5 flex items-center justify-between gap-3")}>
						<span className={cn("flex size-10 items-center justify-center rounded-lg bg-[var(--ret-bg)] text-[var(--ret-text)]")}><PublicIcon name={block.icon} className={cn("size-5")} /></span>
						<span className={cn("text-xs text-[var(--ret-text-muted)]")}>Source included</span>
					</div>
					<h3 className={cn("text-xl font-semibold tracking-tight text-[var(--ret-text)]")}>{block.title}</h3>
					<p className={cn("mt-3 text-sm leading-relaxed text-[var(--ret-text-dim)]")}>{block.description}</p>
					<div className={cn("my-5 flex min-h-10 flex-wrap items-center gap-2")} aria-label={`${block.title} options`}>
						{block.options.map((option, i) => <span key={option} className={cn("inline-flex items-center gap-2 rounded border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2.5 py-2 text-xs text-[var(--ret-text-dim)]")}>
							{block.marks[i] ? <Logo mark={block.marks[i]} size={17} /> : null}{option}
						</span>)}
					</div>
					<p className={cn("mb-6 border-l-2 border-[var(--ret-border)] pl-3 text-xs leading-relaxed text-[var(--ret-text-muted)]")}>{block.boundary}</p>
					<div className={cn("mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-4 border-t border-[var(--ret-border)] pt-4")}>
						<Link href={block.dashboardHref} className={cn("inline-flex items-center gap-2 text-sm font-medium text-[var(--ret-text)] hover:underline focus-visible:outline focus-visible:outline-offset-4")}>{block.action}<ArrowRight aria-hidden="true" className={cn("size-3.5")} /></Link>
						<a href={harnessSourceHref(block.sourcePath)} target="_blank" rel="noopener noreferrer" aria-label={`Inspect ${block.title.toLowerCase()} source`} className={cn("inline-flex items-center gap-1.5 text-xs text-[var(--ret-text-dim)] hover:text-[var(--ret-text)] focus-visible:outline focus-visible:outline-offset-4")}><Code2 aria-hidden="true" className={cn("size-3.5")} />Source</a>
					</div>
				</article>
			))}
			{!dashboard ? <p className={cn("text-sm leading-relaxed text-[var(--ret-text-muted)] md:col-span-2 xl:col-span-3")}>Configuration links open the dashboard and require an account. Inspecting or forking the source does not. Creating a machine uses your connected provider and model accounts.</p> : null}
		</div>
	);
}

export function HarnessComponentsSection() {
	return (
		<section id="building-blocks" aria-labelledby="building-blocks-title" className={cn(LANDING_INSET, "py-16 md:py-20")}>
			<header className={cn("mx-auto mb-9 max-w-2xl text-center")}>
				<p className={cn("mb-3 inline-flex items-center gap-2 text-sm text-[var(--ret-text-muted)]")}><Layers size={16} aria-hidden="true" />The building blocks</p>
				<h2 id="building-blocks-title" className={cn("text-3xl font-semibold tracking-tight text-[var(--ret-text)] md:text-[40px]")}>Use the parts you need.</h2>
				<p className={cn("mx-auto mt-4 max-w-xl text-base leading-7 text-[var(--ret-text-dim)]")}>Configure each layer in the dashboard, or change its source.</p>
			</header>
			<div className={cn("grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3")}>
				{HARNESS_PRIMITIVES.map((block) => <Link key={block.id} href={`/components#${block.id}`} className={cn("group flex min-h-[128px] items-start gap-4 border-t border-[var(--ret-border)] py-6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ret-purple)]")} data-home-primitive={block.id}>
					<span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--ret-bg-soft)] text-[var(--ret-text)]")}><PublicIcon name={block.icon} className={cn("size-[18px]")} /></span>
					<span className={cn("min-w-0 flex-1")}><span className={cn("flex items-center justify-between gap-3 text-base font-semibold tracking-tight text-[var(--ret-text)]")}>{block.title}<ArrowRight size={14} className={cn("text-[var(--ret-text-muted)]")} aria-hidden="true" /></span><span className={cn("mt-2 block text-sm leading-6 text-[var(--ret-text-dim)]")}>{block.options.join(" · ")}</span></span>
				</Link>)}
			</div>
			<div className={cn("mt-7 text-center")}><Link href="/components" className={cn("inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--ret-border)] px-4 text-sm font-medium text-[var(--ret-text)] hover:bg-[var(--ret-bg-soft)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ret-purple)]")}>Explore the component guide<ArrowRight size={15} aria-hidden="true" /></Link></div>
		</section>
	);
}
