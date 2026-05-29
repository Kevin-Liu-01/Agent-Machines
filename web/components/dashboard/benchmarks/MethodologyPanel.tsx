import {
	CATEGORY_LABELS,
	CATEGORY_ORDER,
	METRIC_DEFINITIONS,
	RESPONSIVENESS_SCORE,
} from "@/lib/benchmarks/constants";
import type { ProviderProfile } from "@/lib/benchmarks/types";

import { ProviderBadge } from "./ProviderBadge";

/**
 * Methodology + provenance. Renders straight from the metric catalog so
 * the "what / how measured" prose can never drift from the harness, plus
 * the per-provider citations behind the reference numbers.
 */
export function MethodologyPanel({
	methodology,
	profiles,
}: {
	methodology: string;
	profiles: ProviderProfile[];
}) {
	return (
		<div className="px-4 py-4">
			<p className="max-w-[80ch] text-[12px] leading-relaxed text-[var(--ret-text-dim)]">
				{methodology}
			</p>

			<div className="mt-4 space-y-4">
				{CATEGORY_ORDER.map((category) => {
					const defs = METRIC_DEFINITIONS.filter((m) => m.category === category);
					if (defs.length === 0) return null;
					return (
						<div key={category}>
							<h4 className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
								{CATEGORY_LABELS[category]}
							</h4>
							<dl className="mt-1.5 divide-y divide-[var(--ret-border)] border-y border-[var(--ret-border)]">
								{defs.map((def) => (
									<div
										key={def.id}
										className="grid grid-cols-1 gap-0.5 py-2 sm:grid-cols-[180px_1fr] sm:gap-3"
									>
										<dt className="text-[12px] font-medium text-[var(--ret-text)]">
											{def.label}
											<span className="ml-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">
												{def.unit}
											</span>
										</dt>
										<dd className="text-[11.5px] leading-relaxed text-[var(--ret-text-dim)]">
											{def.method}
										</dd>
									</div>
								))}
							</dl>
						</div>
					);
				})}
			</div>

			<div className="mt-4">
				<h4 className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					Composite
				</h4>
				<dl className="mt-1.5 border-y border-[var(--ret-border)] py-2">
					<div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[180px_1fr] sm:gap-3">
						<dt className="text-[12px] font-medium text-[var(--ret-text)]">
							{RESPONSIVENESS_SCORE.label}
							<span className="ml-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">
								0–100
							</span>
						</dt>
						<dd className="text-[11.5px] leading-relaxed text-[var(--ret-text-dim)]">
							{RESPONSIVENESS_SCORE.method}
						</dd>
					</div>
				</dl>
			</div>

			<div className="mt-5">
				<h4 className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					Reference sources
				</h4>
				<div className="mt-2 space-y-2">
					{profiles.map((p) => (
						<div key={p.provider} className="flex flex-wrap items-center gap-2">
							<ProviderBadge provider={p.provider} label={p.label} size={14} />
							{p.citations.length ? (
								p.citations.map((c) => (
									<a
										key={c.url}
										href={c.url}
										target="_blank"
										rel="noreferrer"
										className="text-[11px] text-[var(--ret-purple)] underline decoration-[var(--ret-border)] underline-offset-2 hover:decoration-[var(--ret-purple)]"
									>
										{c.label}
									</a>
								))
							) : (
								<span className="text-[11px] text-[var(--ret-text-muted)]">
									no public figures
								</span>
							)}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
