import type { SVGProps } from "react";

import type { CapabilityValue, ProviderProfile } from "@/lib/benchmarks/types";

import { ProviderBadge } from "./ProviderBadge";

/** Ordered capability rows shown in the matrix (keys match the seed). */
const CAPABILITY_ROWS: ReadonlyArray<{ key: string; label: string }> = [
	{ key: "isolation", label: "Isolation" },
	{ key: "persistentDisk", label: "Persistent disk" },
	{ key: "scaleToZero", label: "Scale to zero" },
	{ key: "nativeSleepWake", label: "Native sleep / wake" },
	{ key: "streamingExec", label: "Streaming commands" },
	{ key: "publicUrl", label: "Public URL" },
	{ key: "maxRuntime", label: "Max runtime" },
];

export function CapabilityMatrix({ profiles }: { profiles: ProviderProfile[] }) {
	return (
		<div className="overflow-x-auto">
			<table className="w-full border-collapse text-left text-[12px]">
				<thead>
					<tr className="border-b border-[var(--ret-border)]">
						<th className="px-4 py-2.5 font-mono text-[10px] font-normal uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							Capability
						</th>
						{profiles.map((p) => (
							<th key={p.provider} className="px-4 py-2.5">
								<ProviderBadge provider={p.provider} label={p.label} size={15} />
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					<tr className="border-b border-[var(--ret-border)]">
						<td className="px-4 py-2.5 text-[11px] text-[var(--ret-text-dim)]">
							Runtime
						</td>
						{profiles.map((p) => (
							<td
								key={p.provider}
								className="px-4 py-2.5 text-[11px] text-[var(--ret-text)]"
							>
								{p.runtimeKind === "persistent-machine"
									? "Persistent machine"
									: "Ephemeral session"}
							</td>
						))}
					</tr>
					{CAPABILITY_ROWS.map((row) => (
						<tr
							key={row.key}
							className="border-b border-[var(--ret-border)] last:border-b-0"
						>
							<td className="px-4 py-2.5 text-[11px] text-[var(--ret-text-dim)]">
								{row.label}
							</td>
							{profiles.map((p) => (
								<td key={p.provider} className="px-4 py-2.5">
									<CapabilityCell value={p.capabilities[row.key] ?? null} />
								</td>
							))}
						</tr>
					))}
					<tr>
						<td className="px-4 py-2.5 text-[11px] text-[var(--ret-text-dim)]">
							Default spec
						</td>
						{profiles.map((p) => (
							<td
								key={p.provider}
								className="px-4 py-2.5 font-mono text-[11px] text-[var(--ret-text)]"
							>
								{p.defaultSpec.vcpu} vCPU · {(p.defaultSpec.memoryMib / 1024).toFixed(0)} GiB
							</td>
						))}
					</tr>
				</tbody>
			</table>
		</div>
	);
}

function CapabilityCell({ value }: { value: CapabilityValue }) {
	if (typeof value === "boolean") {
		return value ? (
			<IconCheck className="h-3.5 w-3.5 text-[var(--ret-green)]" />
		) : (
			<span className="text-[var(--ret-text-muted)]">—</span>
		);
	}
	if (value === null || value === undefined) {
		return <span className="text-[var(--ret-text-muted)]">—</span>;
	}
	return <span className="text-[11px] text-[var(--ret-text)]">{String(value)}</span>;
}

function IconCheck(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-label="yes"
			{...props}
		>
			<path d="M3 8.5l3.5 3.5L13 4.5" />
		</svg>
	);
}
