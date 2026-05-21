import "server-only";

import { cookies, headers } from "next/headers";

import { isThemePreference, THEME_COOKIE_NAME } from "./constants";

export type ServerThemeAttrs = {
	htmlClassName?: string;
	dataTheme?: "light" | "dark";
};

/** Resolve theme for the initial SSR html element — no client scripts. */
export async function readServerThemeAttrs(): Promise<ServerThemeAttrs> {
	const jar = await cookies();
	const stored = jar.get(THEME_COOKIE_NAME)?.value;

	if (stored === "dark") {
		return { htmlClassName: "dark", dataTheme: "dark" };
	}
	if (stored === "light") {
		return { dataTheme: "light" };
	}

	const theme = isThemePreference(stored) ? stored : "system";
	if (theme !== "system") {
		return {};
	}

	const h = await headers();
	if (h.get("sec-ch-prefers-color-scheme") === "dark") {
		return { htmlClassName: "dark" };
	}

	return {};
}
