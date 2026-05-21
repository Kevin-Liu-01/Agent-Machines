import "server-only";

import {
	applyDemoFleetSnapshot,
	buildDemoFleetSnapshot,
	resetDemoState,
} from "./state";
import {
	clearDemoFleetSnapshot,
	readDemoFleetSnapshot,
	writeDemoFleetSnapshot,
} from "./session-store";

export async function hydrateDemoFleetFromCookie(): Promise<void> {
	const snapshot = await readDemoFleetSnapshot();
	if (!snapshot) return;
	applyDemoFleetSnapshot(snapshot);
}

export async function persistDemoFleetToCookie(): Promise<void> {
	await writeDemoFleetSnapshot(buildDemoFleetSnapshot());
}

export async function resetDemoFleet(): Promise<void> {
	resetDemoState();
	await clearDemoFleetSnapshot();
}
