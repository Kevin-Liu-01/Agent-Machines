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
		<div className="px-5 py-5 sm:px-6">
			<p className="max-w-[80ch] text-sm leading-relaxed text-[var(--ret-text-dim)]">
				{methodology}
			</p>

			<div className="mt-6 space-y-6">
				{CATEGORY_ORDER.map((category) => {
					const defs = METRIC_DEFINITIONS.filter((m) => m.category === category);
					if (defs.length === 0) return null;
					return (
						<div key={category}>
							<h3 className="text-sm font-semibold text-[var(--ret-text)]">
								{CATEGORY_LABELS[category]}
							</h3>
							<dl className="mt-3 divide-y divide-[var(--ret-border)]/30 border-y border-[var(--ret-border)]/30">
								{defs.map((def) => (
									<div
										key={def.id}
										className="grid grid-cols-1 gap-2 py-4 md:grid-cols-[220px_1fr] md:gap-5"
									>
										<dt className="text-sm font-medium text-[var(--ret-text)]">
											{def.label}
											<span className="ml-1.5 text-xs font-medium text-[var(--ret-text-muted)]">
												{def.unit}
											</span>
										</dt>
										<dd className="text-sm leading-6 text-[var(--ret-text-dim)]">
											{def.method}
										</dd>
									</div>
								))}
							</dl>
						</div>
					);
				})}
			</div>

			<div className="mt-6">
				<h3 className="text-sm font-semibold text-[var(--ret-text)]">
					Composite
				</h3>
				<dl className="mt-3 border-y border-[var(--ret-border)]/30 py-4">
					<div className="grid grid-cols-1 gap-2 md:grid-cols-[220px_1fr] md:gap-5">
						<dt className="text-sm font-medium text-[var(--ret-text)]">
							{RESPONSIVENESS_SCORE.label}
							<span className="ml-1.5 text-xs font-medium text-[var(--ret-text-muted)]">
								0–100
							</span>
						</dt>
						<dd className="text-sm leading-6 text-[var(--ret-text-dim)]">
							{RESPONSIVENESS_SCORE.method}
						</dd>
					</div>
				</dl>
			</div>

			<div className="mt-6">
				<h3 className="text-sm font-semibold text-[var(--ret-text)]">
					Reference sources
				</h3>
				<div className="mt-3 space-y-4">
					{profiles.map((p) => (
						<div key={p.provider} className="flex flex-wrap items-center gap-x-4 gap-y-2">
							<ProviderBadge provider={p.provider} label={p.label} size={14} />
							{p.citations.length ? (
								p.citations.map((c) => (
									<a
										key={c.url}
										href={c.url}
										target="_blank"
										rel="noopener noreferrer"
										className="text-sm text-[var(--ret-text-dim)] underline decoration-[var(--ret-border)] underline-offset-4 hover:text-[var(--ret-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)]"
									>
										{c.label}
									</a>
								))
							) : (
								<span className="text-[13px] text-[var(--ret-text-muted)]">
									No cited sources supplied
								</span>
							)}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
