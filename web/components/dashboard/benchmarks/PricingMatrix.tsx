import type { PriceRate, ProviderProfile } from "@/lib/benchmarks/types";

import { ProviderBadge } from "./ProviderBadge";

function formatRate(rate: PriceRate): string {
	if (rate.value === null) return "—";
	return `$${rate.value.toFixed(4)}`;
}

function BasisTag({ basis }: { basis: PriceRate["basis"] }) {
	if (basis === "published") {
		return (
			<span
				className="border border-[var(--ret-green)]/40 px-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--ret-green)]"
				title="Published, cited rate"
			>
				cited
			</span>
		);
	}
	if (basis === "estimate") {
		return (
			<span className="border border-[var(--ret-amber)]/40 px-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--ret-amber)]">
				est
			</span>
		);
	}
	return (
		<span className="border border-[var(--ret-border)] px-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">
			n/a
		</span>
	);
}

/**
 * Pricing comparison. Rates carry a provenance tag (cited / estimate /
 * not public) so the table never implies a number is authoritative when
 * it isn't.
 */
export function PricingMatrix({ profiles }: { profiles: ProviderProfile[] }) {
	return (
		<div className="overflow-x-auto">
			<table className="w-full border-collapse text-left text-[12px]">
				<thead>
					<tr className="border-b border-[var(--ret-border)] text-[var(--ret-text-muted)]">
						<th className="px-4 py-2.5 font-mono text-[10px] font-normal uppercase tracking-[0.18em]">
							Provider
						</th>
						<th className="px-4 py-2.5 font-mono text-[10px] font-normal uppercase tracking-[0.18em]">
							CPU /vCPU-hr
						</th>
						<th className="px-4 py-2.5 font-mono text-[10px] font-normal uppercase tracking-[0.18em]">
							Memory /GiB-hr
						</th>
						<th className="hidden px-4 py-2.5 font-mono text-[10px] font-normal uppercase tracking-[0.18em] sm:table-cell">
							Scale to zero
						</th>
						<th className="hidden px-4 py-2.5 font-mono text-[10px] font-normal uppercase tracking-[0.18em] lg:table-cell">
							Note
						</th>
					</tr>
				</thead>
				<tbody>
					{profiles.map((p) => (
						<tr
							key={p.provider}
							className="border-b border-[var(--ret-border)] last:border-b-0 align-top"
						>
							<td className="px-4 py-2.5">
								<ProviderBadge provider={p.provider} label={p.label} size={15} />
							</td>
							<td className="px-4 py-2.5">
								<span className="inline-flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-[var(--ret-text)]">
									{formatRate(p.pricing.cpuPerVcpuHour)}
									<BasisTag basis={p.pricing.cpuPerVcpuHour.basis} />
								</span>
							</td>
							<td className="px-4 py-2.5">
								<span className="inline-flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-[var(--ret-text)]">
									{formatRate(p.pricing.memoryPerGibHour)}
									<BasisTag basis={p.pricing.memoryPerGibHour.basis} />
								</span>
							</td>
							<td className="hidden px-4 py-2.5 text-[11px] text-[var(--ret-text-dim)] sm:table-cell">
								{p.pricing.scaleToZero ? "Yes" : "—"}
							</td>
							<td className="hidden max-w-[280px] px-4 py-2.5 text-[11px] leading-relaxed text-[var(--ret-text-muted)] lg:table-cell">
								{p.pricing.note ?? "—"}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
