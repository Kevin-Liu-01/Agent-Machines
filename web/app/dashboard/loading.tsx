import { DashboardLoadingState } from "@/components/dashboard/DashboardLoadingState";
import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { Skeleton } from "@/components/ui/Skeleton";

export default function DashboardLoading() {
	return (
		<div className="min-w-0">
			<div aria-hidden="true" className="space-y-4 px-[var(--dashboard-gutter,20px)] pb-2 pt-8 sm:pt-10">
				<Skeleton width={88} height={16} />
				<Skeleton className="w-2/3 max-w-80" height={40} />
				<Skeleton className="w-4/5 max-w-xl" height={16} />
			</div>
			<DashboardPageBody><DashboardLoadingState /></DashboardPageBody>
		</div>
	);
}
