export const THEME_STORAGE_KEY = "agent-machines.theme";
export const THEME_COOKIE_NAME = "agent-machines.theme";

export type ThemePreference = "light" | "dark" | "system";

export function isThemePreference(value: string | undefined): value is ThemePreference {
	return value === "light" || value === "dark" || value === "system";
}
