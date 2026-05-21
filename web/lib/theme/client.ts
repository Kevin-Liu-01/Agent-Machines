import { THEME_COOKIE_NAME, type ThemePreference } from "./constants";

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365;

export function writeThemeCookie(theme: ThemePreference): void {
	if (typeof document === "undefined") return;
	document.cookie = `${THEME_COOKIE_NAME}=${theme};path=/;max-age=${COOKIE_MAX_AGE_SEC};SameSite=Lax`;
}
