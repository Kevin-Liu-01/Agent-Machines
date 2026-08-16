"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const ClerkUserButton = dynamic(
	() => import("./ClerkUserButton").then((module) => module.ClerkUserButton),
	{ ssr: false },
);

/** Keep Clerk's account UI available without making it startup-critical. */
export function DeferredClerkUserButton() {
	const [ready, setReady] = useState(false);

	useEffect(() => {
		if ("requestIdleCallback" in window) {
			const idle = window.requestIdleCallback(() => setReady(true), {
				timeout: 1500,
			});
			return () => window.cancelIdleCallback(idle);
		}
		const timeout = globalThis.setTimeout(() => setReady(true), 1);
		return () => globalThis.clearTimeout(timeout);
	}, []);

	return ready ? <ClerkUserButton /> : <span className="h-7 w-7" aria-hidden />;
}
