import { ReticleLabel } from "@/components/reticle/ReticleLabel";

const STATS: ReadonlyArray<{ label: string; value: string; hint?: string }> = [
	{ label: "vCPU", value: "1" },
	{ label: "memory", value: "2 GiB" },
	{ label: "storage", value: "10 GiB" },
	{ label: "ports", value: "8642 / 9119", hint: "api / dashboard" },
	{ label: "skills", value: "13", hint: "bundled" },
	{ label: "mcp", value: "cursor", hint: "@cursor/sdk" },
];

/**
 * Compact stat strip rendered below the hero -- six small cells separated by
 * 1px outline-collapsed borders so adjacent edges share a single line, the
 * Reticle table look. Each cell is a single fact about the rig.
 */
export function StatsRow() {
	return (
		<div className="mt-12">
			<ReticleLabel>SHAPE</ReticleLabel>
			<div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-[var(--ret-border)] bg-[var(--ret-border)] sm:grid-cols-3 lg:grid-cols-6">
				{STATS.map((s) => (
					<div
						key={s.label}
						className="flex flex-col gap-1.5 bg-[var(--ret-bg)] px-5 py-4 transition-colors duration-200 hover:bg-[var(--ret-surface)]"
					>
						<p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
							{s.label}
						</p>
						<p className="font-mono text-xl text-[var(--ret-text)]">{s.value}</p>
						{s.hint ? (
							<p className="font-mono text-[10px] tracking-wide text-[var(--ret-text-dim)]">
								{s.hint}
							</p>
						) : null}
					</div>
				))}
			</div>
		</div>
	);
}
