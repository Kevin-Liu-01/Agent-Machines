import type { ReactNode } from "react";
import { AlertCircle, CircleDot, type LucideIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { MetricValueSource } from "@/lib/dashboard/benchmarks-view";

export const BENCHMARK_CONTROL = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)] disabled:cursor-not-allowed disabled:opacity-45";
export const BENCHMARK_BUTTON = `${BENCHMARK_CONTROL} border-[var(--ret-border)]/60 bg-[var(--ret-bg)] text-[var(--ret-text-dim)] hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)]`;
export const BENCHMARK_SELECT = "min-h-10 max-w-full rounded-md border border-[var(--ret-border)]/60 bg-[var(--ret-bg)] px-3 text-sm text-[var(--ret-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)]";

export function SourceTag({ source }: { source: MetricValueSource }) {
	return <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", source === "measured" ? "bg-[var(--ret-green)]/10 text-[var(--ret-green)]" : source === "demo" ? "bg-[var(--ret-amber)]/10 text-[var(--ret-amber)]" : "bg-[var(--ret-bg-soft)] text-[var(--ret-text-muted)]")}>
		{source === "measured" ? "Measured" : source === "demo" ? "Demo" : source === "reference" ? "Reference" : "Unavailable"}
	</span>;
}

export function BenchmarkPanel({ id, title, description, icon: Icon, children, action }: { id?: string; title: string; description?: string; icon?: LucideIcon; children: ReactNode; action?: ReactNode }) {
	return <section id={id} className={cn("min-w-0 scroll-mt-24 overflow-hidden rounded-lg border border-[var(--ret-border)]/50 bg-[var(--ret-bg)]")}>
		<header className={cn("flex flex-wrap items-start justify-between gap-4 border-b border-[var(--ret-border)]/40 px-5 py-5 sm:px-6")}>
			<div className={cn("min-w-0 flex-1")}><h2 className={cn("flex items-center gap-2.5 text-lg font-semibold tracking-tight text-[var(--ret-text)]")}>{Icon ? <Icon size={19} aria-hidden="true" className={cn("shrink-0 text-[var(--ret-text-muted)]")} /> : null}{title}</h2>{description ? <p className={cn("mt-2 max-w-3xl text-sm leading-6 text-[var(--ret-text-dim)]")}>{description}</p> : null}</div>{action}
		</header>
		{children}
	</section>;
}

export function BenchmarkNotice({ children, error = false }: { children: ReactNode; error?: boolean }) {
	const Icon = error ? AlertCircle : CircleDot;
	return <div role={error ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-md border px-4 py-3 text-sm leading-6", error ? "border-[var(--ret-red)]/25 bg-[var(--ret-red)]/5 text-[var(--ret-text)]" : "border-[var(--ret-border)]/50 bg-[var(--ret-bg-soft)]/35 text-[var(--ret-text-dim)]")}><Icon size={18} aria-hidden="true" className={cn("mt-0.5 shrink-0", error ? "text-[var(--ret-red)]" : "text-[var(--ret-text-muted)]")} /><div className={cn("min-w-0 flex-1")}>{children}</div></div>;
}
