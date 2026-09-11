import Link from "next/link";
import { ArrowRight, Boxes, SlidersHorizontal, Terminal } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

const STEPS = [
	{ title: "Choose a starting point", description: "Review a starter configuration. Nothing launches yet.", label: "Browse starters", href: "/agents", Icon: Boxes },
	{ title: "Connect your tools", description: "Add instructions, skills, and your model and compute accounts.", label: "Explore the building blocks", href: "/components", Icon: SlidersHorizontal },
	{ title: "Run and inspect", description: "Open the real agent CLI. Check its files, logs, and output.", label: "Open the dashboard", href: "/dashboard", Icon: Terminal },
] as const;

export function SetupJourney() {
	return (
		<section aria-labelledby="setup-journey-title" className={cn("mx-auto max-w-[1080px] px-6 py-12 md:pb-[76px] md:pt-16")}>
			<header className={cn("mb-8 text-center")}>
				<p className={cn("text-sm text-[var(--ret-text-muted)]")}>Your first run</p>
				<h2 id="setup-journey-title" className={cn("mt-3 font-sans text-[28px] font-semibold leading-[1.15] tracking-[-0.04em] text-[var(--ret-text)] text-balance md:text-[40px]")}>Choose. Connect. Run.</h2>
			</header>
			<ol className={cn("m-0 grid list-none grid-cols-1 p-0 md:grid-cols-3")}>
				{STEPS.map(({ title, description, label, href, Icon }, index) => <li key={title} className={cn("border-t border-[var(--ret-border)] px-1 py-6 first:border-t-0 md:border-l md:border-t-0 md:px-7 md:py-3 md:first:border-l-0 [&>h3]:mt-3 [&>h3]:flex [&>h3]:items-center [&>h3]:gap-2 [&>h3]:text-[17px] [&>h3]:font-semibold [&>h3]:tracking-tight [&>h3]:text-[var(--ret-text)] md:[&>h3]:mt-[18px] [&>p]:mt-2.5 [&>p]:text-sm [&>p]:leading-7 [&>p]:text-[var(--ret-text-dim)] [&>a]:mt-2.5 [&>a]:inline-flex [&>a]:min-h-11 [&>a]:items-center [&>a]:gap-[7px] [&>a]:text-xs [&>a]:font-medium [&>a]:text-[var(--ret-text)] [&>a]:underline-offset-4 [&>a:hover]:underline [&>a:focus-visible]:outline-2 [&>a:focus-visible]:outline-offset-3 [&>a:focus-visible]:outline-[var(--ret-purple)]")}>
					<span className={cn("inline-flex size-7 items-center justify-center rounded-full border border-[var(--ret-border)] text-[11px] text-[var(--ret-text-muted)]")} aria-hidden="true">0{index + 1}</span>
					<h3><Icon size={18} aria-hidden="true" />{title}</h3>
					<p>{description}</p>
					<Link href={href}>{label}<ArrowRight size={14} aria-hidden="true" /></Link>
				</li>)}
			</ol>
		</section>
	);
}
