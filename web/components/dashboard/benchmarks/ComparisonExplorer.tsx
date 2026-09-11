"use client";

import { useState } from "react";
import { BarChart3 } from "@/components/ui/icons";
import { CATEGORY_LABELS } from "@/lib/benchmarks/constants";
import type { BenchmarksView } from "@/lib/dashboard/benchmarks-view";
import { cn } from "@/lib/cn";
import { BenchmarkComparisonBars } from "./BenchmarkComparisonBars";
import { BENCHMARK_BUTTON, BENCHMARK_CONTROL, BENCHMARK_SELECT, BenchmarkPanel } from "./BenchmarkUi";
import { ProviderBadge } from "./ProviderBadge";

export function ComparisonExplorer({ view }: { view: BenchmarksView }) {
	const comparisons = view.comparisonsByCategory.flatMap((group) => group.comparisons);
	const [metricId, setMetricId] = useState("coldBootMs");
	const [hiddenProviders, setHiddenProviders] = useState<string[]>([]);
	const selected = comparisons.find((comparison) => comparison.id === metricId) ?? comparisons[0];
	const cells = selected?.cells.filter((cell) => !hiddenProviders.includes(cell.provider)) ?? [];
	return <BenchmarkPanel id="comparison" title="Compare providers" description="Choose a metric and the providers you want to inspect. These filters change the chart only." icon={BarChart3}>
		<div className={cn("flex flex-col gap-5 border-b border-[var(--ret-border)]/40 px-5 py-5 sm:px-6")}>
			<label className={cn("flex flex-wrap items-center gap-3 text-sm font-medium text-[var(--ret-text)]")} htmlFor="benchmark-metric">Metric<select id="benchmark-metric" value={selected?.id ?? ""} onChange={(event) => setMetricId(event.target.value)} className={cn(BENCHMARK_SELECT, "min-w-0 flex-1 sm:max-w-sm")}>{view.comparisonsByCategory.map((group) => <optgroup key={group.category} label={CATEGORY_LABELS[group.category]}>{group.comparisons.map((comparison) => <option key={comparison.id} value={comparison.id}>{comparison.def.label}</option>)}</optgroup>)}</select></label>
			<fieldset><legend className={cn("mb-2.5 text-xs font-medium text-[var(--ret-text-muted)]")}>Providers to compare</legend><div className={cn("flex flex-wrap gap-2")}>{view.profiles.map((profile) => {
				const active = !hiddenProviders.includes(profile.provider);
				return <button type="button" key={profile.provider} aria-label={`Compare ${profile.label}`} aria-pressed={active} onClick={() => setHiddenProviders((current) => active ? [...current, profile.provider] : current.filter((provider) => provider !== profile.provider))} className={cn(BENCHMARK_CONTROL, "hover:border-[var(--ret-text-muted)]", active ? "border-[var(--ret-text-muted)]/60 bg-[var(--ret-surface)]" : "border-[var(--ret-border)]/60 bg-[var(--ret-bg)] opacity-50")}><ProviderBadge provider={profile.provider} label={profile.label} size={18} /></button>;
			})}</div></fieldset>
		</div>
		{selected && cells.length ? <BenchmarkComparisonBars comparison={{ ...selected, cells }} /> : <div className={cn("px-5 py-12 text-center sm:px-6")}><BarChart3 size={24} aria-hidden="true" className={cn("mx-auto text-[var(--ret-text-muted)]")} /><h3 className={cn("mt-3 text-base font-medium text-[var(--ret-text)]")}>Choose a provider to compare</h3><p className={cn("mt-2 text-sm text-[var(--ret-text-dim)]")}>No providers are selected. Your saved results have not changed.</p><button type="button" className={cn(BENCHMARK_BUTTON, "mt-5")} onClick={() => setHiddenProviders([])}>Show all providers</button></div>}
	</BenchmarkPanel>;
}
