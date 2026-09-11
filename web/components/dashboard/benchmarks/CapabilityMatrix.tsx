import { Check, X } from "@/components/ui/icons";
import type { CapabilityValue, ProviderProfile } from "@/lib/benchmarks/types";
import { cn } from "@/lib/cn";
import { ProviderBadge } from "./ProviderBadge";

const CAPABILITY_ROWS = [
	{ key: "isolation", label: "Isolation" },
	{ key: "persistentDisk", label: "Persistent disk" },
	{ key: "scaleToZero", label: "Scale to zero" },
	{ key: "nativeSleepWake", label: "Sleep and resume" },
	{ key: "streamingExec", label: "Streaming commands" },
	{ key: "publicUrl", label: "Public URL" },
	{ key: "maxRuntime", label: "Maximum runtime" },
] as const;

export function CapabilityMatrix({ profiles }: { profiles: ProviderProfile[] }) {
	if (!profiles.length) return <p className={cn("px-5 py-8 text-sm text-[var(--ret-text-dim)]")}>No provider profiles are available in this dataset.</p>;
	return <div role="region" aria-label="Provider capability comparison" tabIndex={0} className={cn("overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ret-purple)]")}>
		<table className={cn("w-full min-w-[760px] border-collapse text-left text-sm")}><caption className={cn("sr-only")}>Provider capabilities. Not documented is distinct from not supported.</caption>
			<thead className={cn("bg-[var(--ret-bg-soft)]/35")}><tr className={cn("border-b border-[var(--ret-border)]/40")}><th scope="col" className={cn("px-5 py-4 text-sm font-medium text-[var(--ret-text-muted)]")}>Capability</th>{profiles.map((profile) => <th scope="col" key={profile.provider} className={cn("min-w-[170px] px-5 py-4")}><ProviderBadge provider={profile.provider} label={profile.label} size={20} /></th>)}</tr></thead>
			<tbody><tr className={cn("border-b border-[var(--ret-border)]/30")}><th scope="row" className={cn("px-5 py-4 font-medium text-[var(--ret-text-dim)]")}>Runtime model</th>{profiles.map((profile) => <td key={profile.provider} className={cn("px-5 py-4 text-[var(--ret-text)]")}>{profile.runtimeKind === "persistent-machine" ? "Persistent machine" : "Ephemeral session"}</td>)}</tr>
				{CAPABILITY_ROWS.map((row) => <tr key={row.key} className={cn("border-b border-[var(--ret-border)]/30")}><th scope="row" className={cn("px-5 py-4 font-medium text-[var(--ret-text-dim)]")}>{row.label}</th>{profiles.map((profile) => <td key={profile.provider} className={cn("max-w-[280px] px-5 py-4 align-top leading-6")}><CapabilityCell value={row.key === "isolation" ? profile.isolation || null : profile.capabilities[row.key] ?? null} /></td>)}</tr>)}
				<tr><th scope="row" className={cn("px-5 py-4 font-medium text-[var(--ret-text-dim)]")}>Default allocation</th>{profiles.map((profile) => <td key={profile.provider} className={cn("px-5 py-4 text-[var(--ret-text)]")}>{profile.defaultSpec ? `${profile.defaultSpec.vcpu} vCPU · ${Number((profile.defaultSpec.memoryMib / 1024).toFixed(2))} GiB` : "Image or request dependent"}</td>)}</tr>
			</tbody>
		</table>
	</div>;
}

function CapabilityCell({ value }: { value: CapabilityValue }) {
	if (value === true) return <span className={cn("inline-flex items-center gap-1.5 text-[var(--ret-text)]")}><Check size={16} aria-hidden="true" className={cn("text-[var(--ret-green)]")} />Supported</span>;
	if (value === false) return <span className={cn("inline-flex items-center gap-1.5 text-[var(--ret-text-muted)]")}><X size={16} aria-hidden="true" />Not supported</span>;
	if (value === null || value === undefined) return <span className={cn("text-[var(--ret-text-muted)]")}>Not documented</span>;
	return <span className={cn("text-[var(--ret-text)]")}>{String(value)}</span>;
}
