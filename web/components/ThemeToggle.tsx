"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Three-state theme toggle: light / dark / system.
 *
 * Writes `data-theme="light"`, `data-theme="dark"`, or removes the
 * attribute (system-follows) on the `<html>` element. Persists the
 * choice in `localStorage["agent-machines.theme"]` so subsequent
 * visits boot in the right palette.
 *
 * Pair with the boot script in `app/layout.tsx` (`<script>` injected
 * before `<body>`) so the data-theme attribute is set before first
 * paint -- otherwise the page flashes the system theme for one frame.
 */

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "agent-machines.theme";

const THEMES: ReadonlyArray<{
	id: Theme;
	label: string;
	Icon: LucideIcon;
}> = [
	{ id: "light", label: "light", Icon: Sun },
	{ id: "dark", label: "dark", Icon: Moon },
	{ id: "system", label: "system", Icon: Monitor },
];

function readStored(): Theme {
	if (typeof window === "undefined") return "system";
	const v = window.localStorage.getItem(STORAGE_KEY);
	if (v === "light" || v === "dark" || v === "system") return v;
	return "system";
}

function systemPrefersDark(): boolean {
	if (typeof window === "undefined") return false;
	return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Apply the resolved theme to <html>. We toggle BOTH:
 *
 *   - `class="dark"` -- drives Tailwind's `dark:` variant (registered
 *     in globals.css as a class-based variant).
 *   - `data-theme="dark"|"light"` -- drives the CSS variable token
 *     swap in globals.css. `system` removes the attribute so the
 *     `prefers-color-scheme: dark` media query takes over for tokens.
 *
 * Tokens and Tailwind utilities now flip together regardless of
 * whether the resolution came from the toggle or the system.
 */
function applyTheme(theme: Theme) {
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

export function ThemeToggle({ className }: { className?: string }) {
	const [theme, setTheme] = useState<Theme>("system");
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
		const stored = readStored();
		setTheme(stored);
		// Re-apply on mount so the class lands even when SSR didn't
		// pre-set it (matches the boot script logic for the system case).
		applyTheme(stored);
	}, []);

	// When the user is on "system", track OS preference changes live so
	// the page flips alongside the system without requiring a toggle
	// click.
	useEffect(() => {
		if (theme !== "system") return;
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyTheme("system");
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, [theme]);

	function pick(next: Theme) {
		setTheme(next);
		applyTheme(next);
		try {
			window.localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// storage disabled -- live with the in-memory state
		}
	}

	// Until mounted, render a neutral placeholder so SSR matches the
	// pre-hydration markup and we don't trigger a hydration warning.
	const active = mounted ? theme : "system";

	return (
		<div
			role="radiogroup"
			aria-label="Theme"
			className={cn(
				"flex h-8 overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-bg-soft)]",
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
							"flex h-full w-8 items-center justify-center transition-colors",
							isActive
								? "bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]"
								: "text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]",
						)}
						title={`${t.label} theme`}
					>
						<Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
						<span className="sr-only">{t.label}</span>
					</button>
				);
			})}
		</div>
	);
}
