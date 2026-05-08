"use client";

import { useEffect, useState } from "react";

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
	id: Theme;
	label: string;
	Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement;
}> = [
	{ id: "light", label: "light", Icon: IconSun },
	{ id: "dark", label: "dark", Icon: IconMoon },
	{ id: "system", label: "system", Icon: IconMonitor },
];

function readStored(): Theme {
	if (typeof window === "undefined") return "system";
	const v = window.localStorage.getItem(STORAGE_KEY);
	if (v === "light" || v === "dark" || v === "system") return v;
	return "system";
}

function applyTheme(theme: Theme) {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
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
		setTheme(readStored());
	}, []);

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
