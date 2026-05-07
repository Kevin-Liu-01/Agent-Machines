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
 *
 * The Dedalus nyx-lines wing graphic sits in the sidebar foot at very low
 * opacity -- present enough to feel branded, quiet enough to never compete
 * with the dashboard's live data on the right.
 */
export function DashboardShell({ children }: Props) {
	return (
		<div className="grid min-h-[100dvh] bg-[var(--ret-bg-soft)] lg:grid-cols-[220px_1fr]">
			<aside className="relative hidden border-r border-[var(--ret-border)] bg-[var(--ret-bg)] lg:block">
				<SidebarNav />
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-[length:auto_100%] bg-bottom bg-no-repeat opacity-[0.06] mix-blend-luminosity dark:opacity-[0.08]"
					style={{ backgroundImage: "url(/brand/bg-nyx-lines.png)" }}
				/>
			</aside>
			<div className="flex min-h-[100dvh] min-w-0 flex-col bg-[var(--ret-bg)]">
				<StatusHeader />
				<main className="flex-1">{children}</main>
			</div>
		</div>
	);
}
