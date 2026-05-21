"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { writeThemeCookie } from "@/lib/theme/client";
import { isThemePreference, THEME_STORAGE_KEY, type ThemePreference } from "@/lib/theme/constants";

/**
 * Three-state theme toggle: light / dark / system.
 *
 * Persists to localStorage (client) and an httpOnly-safe mirror cookie
 * (via document.cookie) so the root layout can SSR the correct palette
 * without injecting executable <script> tags — React 19 rejects those.
 */

function IconSun(props: React.SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" {...props}>
			<circle cx="8" cy="8" r="3" />
			<path d="M8 1.5v1.5M8 13v1.5M2.5 2.5l1 1M12.5 12.5l1 1M1.5 8h1.5M13 8h1.5M2.5 13.5l1-1M12.5 3.5l1-1" />
		</svg>
	);
}

function IconMoon(props: React.SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M14 9.5A6 6 0 1 1 6.5 2 5 5 0 0 0 14 9.5z" />
		</svg>
	);
}

function IconMonitor(props: React.SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<rect x="2" y="2.5" width="12" height="9" />
			<path d="M5 14h6M8 11.5V14" />
		</svg>
	);
}

const THEMES: ReadonlyArray<{
	id: ThemePreference;
	label: string;
	Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement;
}> = [
	{ id: "light", label: "light", Icon: IconSun },
	{ id: "dark", label: "dark", Icon: IconMoon },
	{ id: "system", label: "system", Icon: IconMonitor },
];

function readStored(): ThemePreference {
	if (typeof window === "undefined") return "system";
	const v = window.localStorage.getItem(THEME_STORAGE_KEY);
	if (v && isThemePreference(v)) return v;
	return "system";
}

function systemPrefersDark(): boolean {
	if (typeof window === "undefined") return false;
	return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(theme: ThemePreference) {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	const isDark =
		theme === "dark" || (theme === "system" && systemPrefersDark());
	root.classList.toggle("dark", isDark);
	if (theme === "system") {
		root.removeAttribute("data-theme");
	} else {
		root.setAttribute("data-theme", theme);
	}
}

function persistTheme(theme: ThemePreference) {
	writeThemeCookie(theme);
	try {
		window.localStorage.setItem(THEME_STORAGE_KEY, theme);
	} catch {
		// storage disabled — cookie mirror still helps the next SSR pass
	}
}

export function ThemeToggle({ className }: { className?: string }) {
	const [theme, setTheme] = useState<ThemePreference>("system");
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
		const stored = readStored();
		setTheme(stored);
		persistTheme(stored);
		applyTheme(stored);
	}, []);

	useEffect(() => {
		if (theme !== "system") return;
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyTheme("system");
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, [theme]);

	function pick(next: ThemePreference) {
		setTheme(next);
		applyTheme(next);
		persistTheme(next);
	}

	const active = mounted ? theme : "system";

	return (
		<div
			role="radiogroup"
			aria-label="Theme"
			className={cn(
				"flex overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]",
				className,
			)}
		>
			{THEMES.map((t) => {
				const isActive = active === t.id;
				const Icon = t.Icon;
				return (
					<button
						key={t.id}
						type="button"
						role="radio"
						aria-checked={isActive}
						onClick={() => pick(t.id)}
						className={cn(
							"flex h-6 w-7 items-center justify-center transition-colors",
							isActive
								? "bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
								: "text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]",
						)}
						title={`${t.label} theme`}
					>
						<Icon className="h-3.5 w-3.5" />
						<span className="sr-only">{t.label}</span>
					</button>
				);
			})}
		</div>
	);
}
