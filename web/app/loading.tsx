import { Skeleton } from "@/components/ui/Skeleton";

export default function PageLoading() {
	return (
		<div role="status" aria-live="polite" className="mx-auto min-h-[60vh] w-full max-w-7xl space-y-8 px-5 py-16 sm:px-8 lg:px-10">
			<p className="text-sm text-[var(--ret-text-muted)]">Loading page…</p>
			<div aria-hidden="true" className="space-y-6">
				<Skeleton className="w-3/4 max-w-xl" height={48} />
				<Skeleton className="w-full max-w-2xl" height={20} />
				<Skeleton className="w-full" height={256} />
			</div>
		</div>
	);
}
