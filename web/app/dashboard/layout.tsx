import type { ReactNode } from "react";

import { AutoWake } from "@/components/dashboard/AutoWake";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getUserConfig } from "@/lib/user-config/clerk";
import {
	DEFAULT_USER_CONFIG,
	toPublicConfig,
	type PublicUserConfig,
} from "@/lib/user-config/schema";

export const metadata = {
	title: "Dashboard -- Agent Machines",
};

/**
 * Reads the caller's config server-side and passes a `PublicUserConfig`
 * down to the shell. Every dashboard surface (sidebar, status header,
 * agent switcher) renders from this single source of truth instead of
 * each fetching the same endpoint.
 *
 * If the user is somehow on this page without a Clerk session (race on
 * sign-out, dev mode without Clerk), we fall back to the default config
 * so the shell still renders -- the wizard's "API key required" gate
 * will catch any actual operations.
 */
export default async function DashboardLayout({
	children,
}: {
	children: ReactNode;
}) {
	let publicConfig: PublicUserConfig;
	try {
		publicConfig = toPublicConfig(await getUserConfig());
	} catch {
		publicConfig = toPublicConfig({ ...DEFAULT_USER_CONFIG });
	}
	return (
		<DashboardShell config={publicConfig}>
			<AutoWake />
			{children}
		</DashboardShell>
	);
}
