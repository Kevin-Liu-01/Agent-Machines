/**
 * Cookie-backed demo fleet snapshot — survives RSC/API route boundaries
 * so freshly provisioned machines stay addressable after navigation.
 */

import "server-only";

import { cookies } from "next/headers";

import type { DemoFleetSnapshot } from "./demo-types";

const COOKIE_NAME = "am-demo-fleet-v1";
const MAX_AGE_SEC = 60 * 60 * 24;

export async function readDemoFleetSnapshot(): Promise<DemoFleetSnapshot | null> {
	const jar = await cookies();
	const raw = jar.get(COOKIE_NAME)?.value;
	if (!raw) return null;
	try {
		return JSON.parse(decodeURIComponent(raw)) as DemoFleetSnapshot;
	} catch {
		return null;
	}
}

export async function writeDemoFleetSnapshot(snapshot: DemoFleetSnapshot): Promise<void> {
	const jar = await cookies();
	const payload = encodeURIComponent(JSON.stringify(snapshot));
	if (payload.length > 3500) return;
	jar.set(COOKIE_NAME, payload, {
		httpOnly: true,
		sameSite: "lax",
		path: "/",
		maxAge: MAX_AGE_SEC,
	});
}

export async function clearDemoFleetSnapshot(): Promise<void> {
	const jar = await cookies();
	jar.delete(COOKIE_NAME);
}
