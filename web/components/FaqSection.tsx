import { MessageSquare } from "@/components/ui/icons";
import { GearDetail } from "@/components/marketing/MechanicalDetails";
import { cn } from "@/lib/cn";
import { LANDING_BODY, LANDING_EYEBROW, LANDING_INSET, LANDING_SECTION_SPACE, LANDING_SPLIT, LANDING_TITLE } from "@/lib/marketing/layout";
import { FAQ } from "@/lib/seo/config";

export function FaqSection() {
	return (
		<section aria-labelledby="faq-heading" className={cn(LANDING_INSET, LANDING_SECTION_SPACE)}>
			<header data-landing-header className={cn(LANDING_SPLIT, "items-end pb-8")}>
				<div>
					<p className={cn(LANDING_EYEBROW)}><MessageSquare className={cn("size-4")} aria-hidden="true" />Common questions</p>
					<h2 id="faq-heading" className={cn(LANDING_TITLE, "max-w-[20ch]")}>
						Before your first Worker.
					</h2>
				</div>
				<div className={cn("flex items-center gap-5")}>
					<p className={cn(LANDING_BODY, "max-w-[48ch]")}>
						How Workers run, what stays with them, and how to get started.
					</p>
					<span className={cn("hidden sm:block")}><GearDetail /></span>
				</div>
			</header>

			<dl className={cn("divide-y divide-[var(--ret-border)]/30 border-y border-[var(--ret-border)]/30")}>
				{FAQ.map(({ question, answer }, i) => (
					<div
						key={question}
						className={cn(LANDING_SPLIT, "relative items-start py-7")}
					>
						<dt>
							<span aria-hidden="true" className={cn("pointer-events-none absolute bottom-2 right-0 font-sans text-sm tabular-nums text-[var(--ret-text-muted)]/30")}>
								{String(i + 1).padStart(2, "0")}
							</span>
							<h3 className={cn("max-w-[42ch] text-lg font-semibold leading-7 tracking-tight text-[var(--ret-text)]")}>
								{question}
							</h3>
						</dt>
						<dd className={cn(LANDING_BODY)}>
							{answer}
						</dd>
					</div>
				))}
			</dl>
		</section>
	);
}
