import type { ReactNode } from "react";

import { SidebarNav } from "./SidebarNav";
import { StatusHeader } from "./StatusHeader";

type Props = {
	children: ReactNode;
};

/**
 * Persistent dashboard frame. The sidebar collapses below the lg breakpoint
 * (we hide it; the marketing landing is the small-screen entry point). The
 * status header sticks to the top and stays visible over scrolled content.
 *
 * Background uses `--ret-bg-soft` so the main content cards on
 * `--ret-bg`/`--ret-surface` get a slight contrast edge without a hard
 * border line in every direction.
 */
export function DashboardShell({ children }: Props) {
	return (
		<div className="grid min-h-[100dvh] bg-[var(--ret-bg-soft)] lg:grid-cols-[220px_1fr]">
			<aside className="hidden border-r border-[var(--ret-border)] bg-[var(--ret-bg)] lg:block">
				<SidebarNav />
			</aside>
			<div className="flex min-h-[100dvh] min-w-0 flex-col bg-[var(--ret-bg)]">
				<StatusHeader />
				<main className="flex-1">{children}</main>
			</div>
		</div>
	);
}
