"use client";

import { useEffect, useState } from "react";

import type { McpServerWithBrand } from "@/lib/dashboard/mcps";
import type { PublicUserConfig } from "@/lib/user-config/schema";

export type FleetLoadoutSnapshot = {
	config: PublicUserConfig;
	mcps: McpServerWithBrand[];
	skillCount: number;
};

export function useFleetLoadout(): FleetLoadoutSnapshot | null {
	const [snapshot, setSnapshot] = useState<FleetLoadoutSnapshot | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			try {
				const [setupRes, mcpsRes, skillsRes] = await Promise.all([
					fetch("/api/dashboard/admin/setup", { cache: "no-store" }),
					fetch("/api/dashboard/mcps", { cache: "no-store" }),
					fetch("/api/dashboard/skills", { cache: "no-store" }),
				]);
				if (!setupRes.ok || !mcpsRes.ok || !skillsRes.ok) return;

				const setup = (await setupRes.json()) as { config: PublicUserConfig };
				const mcpsBody = (await mcpsRes.json()) as { servers: McpServerWithBrand[] };
				const skillsBody = (await skillsRes.json()) as { skills: unknown[] };

				if (!cancelled) {
					setSnapshot({
						config: setup.config,
						mcps: mcpsBody.servers ?? [],
						skillCount: skillsBody.skills?.length ?? 0,
					});
				}
			} catch {
				/* loadout is decorative — fleet still works without it */
			}
		}

		void load();
		return () => {
			cancelled = true;
		};
	}, []);

	return snapshot;
}
