"use client";

import { createContext, useContext } from "react";

/** When set, overrides ReticleFrame's default corner visibility. */
export const ReticleFrameCornersContext = createContext<boolean | undefined>(
	undefined,
);

export function useReticleFrameCornersDefault(): boolean | undefined {
	return useContext(ReticleFrameCornersContext);
}
