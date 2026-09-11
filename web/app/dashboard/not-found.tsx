import { EmptyState } from "@/components/dashboard/EmptyState";

export default function DashboardNotFound() {
	return <EmptyState title="Workspace or page not found" description="It may have been removed, or may not be available to this account. Choose a machine from your fleet to continue." action={{ label: "Open your fleet", href: "/dashboard/machines" }} secondaryAction={{ label: "Back to overview", href: "/dashboard" }} />;
}
