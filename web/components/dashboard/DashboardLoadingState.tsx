import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

type Props = {
	label?: string;
	variant?: "cards" | "table" | "editor";
	className?: string;
};

/** Content-only placeholder: callers own the page gutter. Never stands in for
 * an empty result or a failed request. Skeleton shapes are decorative. */
export function DashboardLoadingState({ label = "Loading your workspace…", variant = "cards", className }: Props) {
	return (
		<div role="status" aria-live="polite" className={cn("min-w-0 space-y-4", className)}>
			<p className="text-sm text-[var(--ret-text-muted)]">{label}</p>
			{variant === "table" ? (
				<div aria-hidden="true" className="overflow-hidden border border-[var(--ret-border)]">
					{Array.from({ length: 5 }, (_, index) => (
						<div key={index} className="flex items-center gap-4 border-b border-[var(--ret-border)] p-4 last:border-b-0">
							<Skeleton width={32} height={32} />
							<Skeleton className="w-1/3 max-w-64" height={16} />
							<Skeleton className="ml-auto w-1/5 max-w-24" height={12} />
						</div>
					))}
				</div>
			) : variant === "editor" ? (
				<div aria-hidden="true" className="space-y-5 border border-[var(--ret-border)] p-5 sm:p-6">
					<Skeleton className="w-2/5 max-w-60" height={20} />
					<Skeleton height={40} />
					<Skeleton height={152} />
					<Skeleton width={112} height={36} />
				</div>
			) : (
				<div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{Array.from({ length: 3 }, (_, index) => (
						<div key={index} className="min-w-0 space-y-5 border border-[var(--ret-border)] p-5">
							<Skeleton width={40} height={40} />
							<Skeleton className="w-2/3" height={20} />
							<Skeleton height={12} />
							<Skeleton className="w-4/5" height={12} />
							<Skeleton width={96} height={32} />
						</div>
					))}
				</div>
			)}
		</div>
	);
}
