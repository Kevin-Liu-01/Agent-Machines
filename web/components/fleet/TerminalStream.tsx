"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

const LINE_MS = 520;

export function TerminalStream({
	lines,
	color,
	delaySec = 0,
	live = false,
}: {
	lines: string[];
	color: string;
	delaySec?: number;
	live?: boolean;
}) {
	const [visible, setVisible] = useState(-1);
	const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
	const prevLinesRef = useRef<string[]>([]);
	const visibleRef = useRef(-1);

	useEffect(() => {
		visibleRef.current = visible;
	}, [visible]);

	useEffect(() => {
		let cancelled = false;

		function clearTimer() {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
		}

		const prev = prevLinesRef.current;
		const samePrefix =
			live &&
			prev.length > 0 &&
			lines.length >= prev.length &&
			prev.every((line, i) => lines[i] === line);
		const startAt = samePrefix ? Math.max(visibleRef.current, prev.length - 1) : -1;

		prevLinesRef.current = lines;

		if (samePrefix && startAt >= lines.length - 1) {
			setVisible(lines.length - 1);
			return () => {
				cancelled = true;
				clearTimer();
			};
		}

		if (!samePrefix) setVisible(-1);

		function revealFrom(step: number) {
			let i = step;
			function tick() {
				if (cancelled) return;
				i += 1;
				if (i >= lines.length) return;
				setVisible(i);
				timerRef.current = setTimeout(tick, LINE_MS + Math.random() * 180);
			}
			if (i < lines.length - 1) tick();
			else setVisible(Math.max(0, lines.length - 1));
		}

		clearTimer();
		const delayMs = samePrefix ? 0 : delaySec * 1000;
		timerRef.current = setTimeout(() => revealFrom(startAt), delayMs);

		return () => {
			cancelled = true;
			clearTimer();
		};
	}, [lines, delaySec, live]);

	return (
		<div className="flex max-h-[108px] flex-col gap-px overflow-hidden font-mono">
			{lines.map((line, i) => {
				const isCommand = line.startsWith("$");
				const isIdentity = i === 1 && !line.startsWith("$") && line.includes(" · ");
				return (
					<div
						key={`${i}-${line.slice(0, 32)}`}
						className={cn(
							"whitespace-nowrap text-[10px] leading-[1.6] transition-all duration-300",
							i <= visible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
							isIdentity && "text-[var(--ret-text-muted)]",
						)}
					>
						{isCommand ? (
							<span style={{ color }}>{line}</span>
						) : (
							<span className="text-[var(--ret-text-dim)]">
								<span style={{ color }} className="mr-1 opacity-50">
									›
								</span>
								{line}
							</span>
						)}
					</div>
				);
			})}
			{visible >= lines.length - 1 && lines.length > 0 ? (
				<span className="ret-caret mt-0.5 inline-block text-[10px]" style={{ color }} aria-hidden="true" />
			) : null}
		</div>
	);
}
