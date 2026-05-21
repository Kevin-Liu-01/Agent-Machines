/**
 * Cookie-backed demo fleet snapshot — survives RSC/API route boundaries
 * so freshly provisioned machines stay addressable after navigation.
 */

import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import type { DemoFleetSnapshot } from "./demo-types";

export const DEMO_FLEET_COOKIE_NAME = "am-demo-fleet-v1";
const MAX_AGE_SEC = 60 * 60 * 24;
/** Browser cookie value limit (~4KB); Set-Cookie URL-encodes JSON. */
export const DEMO_FLEET_MAX_WIRE_PAYLOAD = 3600;

export function demoFleetPayloadWireLength(payload: string): number {
	return encodeURIComponent(payload).length;
}

export function demoFleetPayloadFitsCookie(payload: string): boolean {
	return demoFleetPayloadWireLength(payload) <= DEMO_FLEET_MAX_WIRE_PAYLOAD;
}

export function parseDemoFleetSnapshot(raw: string): DemoFleetSnapshot | null {
	try {
		return JSON.parse(raw) as DemoFleetSnapshot;
	} catch {
		try {
			return JSON.parse(decodeURIComponent(raw)) as DemoFleetSnapshot;
		} catch {
			return null;
		}
	}
}

export function demoFleetCookiePayload(snapshot: DemoFleetSnapshot): string | null {
	const payload = JSON.stringify(snapshot);
	if (!demoFleetPayloadFitsCookie(payload)) return null;
	return payload;
}

export async function readDemoFleetSnapshot(): Promise<DemoFleetSnapshot | null> {
	const jar = await cookies();
	const raw = jar.get(DEMO_FLEET_COOKIE_NAME)?.value;
	if (!raw) return null;
	return parseDemoFleetSnapshot(raw);
}

export async function writeDemoFleetSnapshot(snapshot: DemoFleetSnapshot): Promise<boolean> {
	const payload = demoFleetCookiePayload(snapshot);
	if (!payload) return false;
	const jar = await cookies();
	jar.set(DEMO_FLEET_COOKIE_NAME, payload, {
		httpOnly: true,
		sameSite: "lax",
		path: "/",
		maxAge: MAX_AGE_SEC,
	});
	return true;
}

export function attachDemoFleetSnapshotCookie(
	response: NextResponse,
	snapshot: DemoFleetSnapshot,
): boolean {
	const payload = demoFleetCookiePayload(snapshot);
	if (!payload) return false;
	response.cookies.set(DEMO_FLEET_COOKIE_NAME, payload, {
		httpOnly: true,
		sameSite: "lax",
		path: "/",
		maxAge: MAX_AGE_SEC,
	});
	return true;
}

export async function clearDemoFleetSnapshot(): Promise<void> {
	const jar = await cookies();
	jar.delete(DEMO_FLEET_COOKIE_NAME);
}
