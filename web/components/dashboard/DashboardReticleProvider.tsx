"use client";

import type { ReactNode } from "react";

import { ReticleFrameCornersContext } from "@/components/reticle/ReticleFrameContext";

/** Dashboard surfaces use Reticle borders without corner cross marks. */
export function DashboardReticleProvider({ children }: { children: ReactNode }) {
	return (
		<ReticleFrameCornersContext.Provider value={false}>
			{children}
		</ReticleFrameCornersContext.Provider>
	);
}
