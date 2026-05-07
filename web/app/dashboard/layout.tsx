import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/DashboardShell";

export const metadata = {
	title: "Dashboard -- Hermes Machines",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
	return <DashboardShell>{children}</DashboardShell>;
}
