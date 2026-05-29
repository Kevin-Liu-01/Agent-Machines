import { Logo } from "@/components/Logo";
import { cn } from "@/lib/cn";
import type { ProviderKind } from "@/lib/user-config/schema";

type Props = {
	provider: ProviderKind;
	label?: string;
	size?: number;
	showLabel?: boolean;
	className?: string;
};

/** Provider logo (reusing the shared ServiceIcon / Logo marks) + label. */
export function ProviderBadge({
	provider,
	label,
	size = 16,
	showLabel = true,
	className,
}: Props) {
	return (
		<span className={cn("inline-flex items-center gap-1.5", className)}>
			<ProviderMark provider={provider} size={size} />
			{showLabel ? (
				<span className="truncate text-[12px] text-[var(--ret-text)]">
					{label ?? provider}
				</span>
			) : null}
		</span>
	);
}

export function ProviderMark({
	provider,
	size = 16,
}: {
	provider: ProviderKind;
	size?: number;
}) {
	// `Logo` carries a mark for every substrate (dedalus/e2b/sprites/vercel)
	// with the correct per-brand tone — including Vercel's theme-adaptive
	// triangle — so providers render consistently across the dashboard.
	return <Logo mark={provider} size={size} />;
}
