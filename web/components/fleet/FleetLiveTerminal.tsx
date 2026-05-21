"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

/** Fixed viewport — all fleet cards share this height. */
export const FLEET_TERMINAL_HEIGHT_CLASS = "h-[11rem]";

const BASE_LINE_MS = 520;

function lineDelayMs(line: string, index: number): number {
	if (line.startsWith("task:")) return BASE_LINE_MS + 180;
	if (line.includes("finding") || line.includes("502") || line.includes("WARN")) {
		return BASE_LINE_MS + 260;
	}
	if (line.includes("tool ") || line.includes("delegate") || line.includes("spawn")) {
		return BASE_LINE_MS + 140;
	}
	if (line.includes("write ") || line.includes("wrote ")) return BASE_LINE_MS + 90;
	if (index === 0) return BASE_LINE_MS;
	return BASE_LINE_MS + Math.floor(Math.random() * 160);
}

export function FleetLiveTerminal({
	lines,
	color,
	delaySec = 0,
	streamActive = false,
	loading = false,
}: {
	lines: string[];
	color: string;
	delaySec?: number;
	streamActive?: boolean;
	loading?: boolean;
}) {
	const [visible, setVisible] = useState(-1);
	const [pulse, setPulse] = useState(0);
	const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const prevKeyRef = useRef("");

	const linesKey = lines.join("\0");
	const fullyRevealed = lines.length > 0 && visible >= lines.length - 1;

	useEffect(() => {
		if (visible >= 0 && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [visible, linesKey, pulse]);

	useEffect(() => {
		let cancelled = false;

		function clearTimer() {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
		}

		if (loading) {
			setVisible(-1);
			return clearTimer;
		}

		const sameContent = prevKeyRef.current === linesKey;
		prevKeyRef.current = linesKey;

		if (sameContent) {
			return clearTimer;
		}

		setVisible(-1);

		function revealFrom(start: number) {
			let i = start;
			function tick() {
				if (cancelled) return;
				i += 1;
				if (i >= lines.length) return;
				setVisible(i);
				timerRef.current = setTimeout(tick, lineDelayMs(lines[i] ?? "", i));
			}
			if (lines.length === 0) return;
			if (i < lines.length - 1) tick();
			else setVisible(Math.max(0, lines.length - 1));
		}

		clearTimer();
		timerRef.current = setTimeout(() => revealFrom(-1), delaySec * 1000);

		return () => {
			cancelled = true;
			clearTimer();
		};
	}, [linesKey, delaySec, loading, lines.length]);

	useEffect(() => {
		if (!streamActive || loading || !fullyRevealed) return;

		const id = window.setInterval(() => {
			setPulse((c) => c + 1);
		}, 1800);

		return () => window.clearInterval(id);
	}, [streamActive, loading, fullyRevealed]);

	if (loading) {
		return (
			<div
				className={cn(
					FLEET_TERMINAL_HEIGHT_CLASS,
					"font-mono text-[10px] leading-[1.6] text-[var(--ret-text-muted)]",
				)}
			>
				<span style={{ color }} className="opacity-70">
					›
				</span>{" "}
				syncing live activity…
				<span className="ret-caret ml-0.5 inline-block" style={{ color }} aria-hidden="true" />
			</div>
		);
	}

	return (
		<div
			ref={scrollRef}
			className={cn(
				FLEET_TERMINAL_HEIGHT_CLASS,
				"fleet-terminal-scroll overflow-y-auto overflow-x-hidden font-mono",
			)}
		>
			<div className="flex flex-col gap-px pr-1 pb-1">
				{lines.map((line, i) => {
					const isTask = line.startsWith("task:");
					const shown = fullyRevealed || i <= visible;
					const isLatest =
						streamActive && fullyRevealed && i === lines.length - 1 && pulse % 2 === 0;
					return (
						<div
							key={`${i}-${line.slice(0, 48)}`}
							className={cn(
								"text-[10px] leading-[1.65] transition-opacity duration-300",
								shown ? "opacity-100" : "pointer-events-none max-h-0 overflow-hidden opacity-0",
								isTask && "font-medium text-[var(--ret-text)]",
								isLatest && "text-[var(--ret-text)]",
							)}
						>
							<span className="whitespace-pre-wrap break-all text-[var(--ret-text-dim)]">
								<span
									style={{ color: isTask ? color : undefined }}
									className={cn("mr-1", isTask ? "opacity-90" : "opacity-50")}
								>
									›
								</span>
								{line}
							</span>
						</div>
					);
				})}
				{(fullyRevealed || visible >= 0) && lines.length > 0 ? (
					<span className="ret-caret mt-0.5 inline-block text-[10px]" style={{ color }} aria-hidden="true" />
				) : null}
			</div>
		</div>
	);
}
