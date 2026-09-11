import { ExternalLink } from "@/components/ui/icons";
import type { PriceRate, ProviderProfile } from "@/lib/benchmarks/types";
import { cn } from "@/lib/cn";
import { ProviderBadge } from "./ProviderBadge";

function RateCell({ rate }: { rate: PriceRate }) {
	const known = rate.value !== null && Number.isFinite(rate.value);
	return <div className={cn("space-y-1")}><span className={cn("block text-sm font-medium tabular-nums text-[var(--ret-text)]")}>{known ? `$${rate.value!.toFixed(4)}` : "Not supplied"}</span><span className={cn("text-xs", rate.basis === "estimate" ? "text-[var(--ret-amber)]" : "text-[var(--ret-text-muted)]")}>{rate.basis === "published" ? "Published reference" : rate.basis === "estimate" ? "Estimate" : "Verify with provider"}</span></div>;
}

export function PricingMatrix({ profiles }: { profiles: ProviderProfile[] }) {
	if (!profiles.length) return <p className={cn("px-5 py-8 text-sm text-[var(--ret-text-dim)]")}>No provider pricing profiles are available.</p>;
	return <div>
		<div role="region" aria-label="Provider reference pricing comparison" tabIndex={0} className={cn("overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ret-purple)]")}>
			<table className={cn("w-full min-w-[850px] border-collapse text-left text-sm")}><caption className={cn("sr-only")}>Historical reference rates in US dollars. These are not current price quotes.</caption><thead className={cn("bg-[var(--ret-bg-soft)]/35")}><tr className={cn("border-b border-[var(--ret-border)]/40")}>{["Provider", "CPU / vCPU-hour", "Memory / GiB-hour", "Storage / GiB-hour", "Scale-to-zero profile"].map((heading) => <th scope="col" key={heading} className={cn("px-5 py-4 font-medium text-[var(--ret-text-muted)]")}>{heading}</th>)}</tr></thead><tbody>{profiles.map((profile) => <tr key={profile.provider} className={cn("border-b border-[var(--ret-border)]/30 align-top last:border-b-0")}><th scope="row" className={cn("px-5 py-4")}><ProviderBadge provider={profile.provider} label={profile.label} size={20} /></th><td className={cn("px-5 py-4")}><RateCell rate={profile.pricing.cpuPerVcpuHour} /></td><td className={cn("px-5 py-4")}><RateCell rate={profile.pricing.memoryPerGibHour} /></td><td className={cn("px-5 py-4")}><RateCell rate={profile.pricing.storagePerGibHour} /></td><td className={cn("px-5 py-4 text-[var(--ret-text-dim)]")}>{profile.pricing.scaleToZero ? "Listed as supported" : "Not included in this profile"}</td></tr>)}</tbody></table>
		</div>
		<div className={cn("space-y-4 border-t border-[var(--ret-border)]/40 px-5 py-5 sm:px-6")}><h3 className={cn("text-sm font-semibold text-[var(--ret-text)]")}>Before you choose a provider</h3>{profiles.map((profile) => <div key={profile.provider} className={cn("grid gap-2 sm:grid-cols-[145px_minmax(0,1fr)] sm:gap-5")}><ProviderBadge provider={profile.provider} label={profile.label} size={17} /><div><p className={cn("text-sm leading-6 text-[var(--ret-text-dim)]")}>{profile.pricing.note ?? "Check billing units, minimum charges, retained storage, and your account’s current terms."}</p>{profile.citations.length ? <a href="#methodology" className={cn("mt-1 inline-flex min-h-8 items-center gap-1.5 text-xs font-medium text-[var(--ret-text-muted)] hover:text-[var(--ret-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)]")}>View cited sources <ExternalLink size={12} aria-hidden="true" /></a> : null}</div></div>)}</div>
	</div>;
}
