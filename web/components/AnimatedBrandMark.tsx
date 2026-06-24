"use client";

import { useEffect, useRef, useState } from "react";

import { Logo, type Mark } from "@/components/Logo";
import { cn } from "@/lib/cn";

const AGENTS: { mark: Mark; label: string }[] = [
	{ mark: "nous", label: "Hermes" },
	{ mark: "openclaw", label: "OpenClaw" },
	{ mark: "claudecode", label: "Claude" },
	{ mark: "codex", label: "Codex" },
	{ mark: "cursor", label: "Cursor" },
];

type Props = {
	size?: number;
	className?: string;
	gap?: "tight" | "default";
	/** Fast initial carousel on mount (navbar hero moment). Off by default. */
	intro?: boolean;
};

export function AnimatedBrandMark({
	size = 20,
	className,
	gap = "default",
	intro = false,
}: Props) {
	const [activeIdx, setActiveIdx] = useState(0);
	const [phase, setPhase] = useState<"spin" | "settle" | "cruise">(
		intro ? "spin" : "cruise",
	);
	const [hovered, setHovered] = useState(false);
	const spinCount = useRef(0);
	const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

	useEffect(() => {
		if (timerRef.current) clearTimeout(timerRef.current);

		function tick() {
			if (!intro && phase === "spin") {
				setPhase("cruise");
				timerRef.current = setTimeout(tick, hovered ? 700 : 5000);
				return;
			}
			if (phase === "spin") {
				setActiveIdx((i) => (i + 1) % AGENTS.length);
				spinCount.current += 1;
				if (spinCount.current >= 15) {
					setPhase("settle");
					timerRef.current = setTimeout(tick, 1200);
				} else {
					timerRef.current = setTimeout(tick, 120 + spinCount.current * 15);
				}
			} else if (phase === "settle") {
				setPhase("cruise");
				timerRef.current = setTimeout(tick, hovered ? 700 : 5000);
			} else {
				setActiveIdx((i) => (i + 1) % AGENTS.length);
				timerRef.current = setTimeout(tick, hovered ? 700 : 5000);
			}
		}

		const initialDelay = phase === "cruise" ? (hovered ? 200 : 5000) : 500;
		timerRef.current = setTimeout(tick, initialDelay);
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [phase, hovered, intro]);

	const dur = phase === "spin"
		? `${200 + spinCount.current * 20}ms`
		: phase === "settle"
			? "600ms"
			: hovered
				? "300ms"
				: "500ms";

	const h = size + (gap === "tight" ? 6 : 8);

	return (
		<span
			className={cn(
				"inline-flex items-center",
				gap === "tight" ? "gap-1.5" : "gap-2.5",
				className,
			)}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			<Logo mark="am" size={Math.round(size * 1.2)} />
			<span className="font-mono text-[0.7em] text-[var(--ret-text-muted)]">
				{"\u00d7"}
			</span>
			<span
				className="relative inline-flex"
				style={{ height: `${h}px`, width: `${size}px` }}
			>
				{/* Top fade */}
				<span
					className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1.5"
					style={{ background: "linear-gradient(to bottom, var(--ret-bg), transparent)" }}
				/>
				{/* Bottom fade */}
				<span
					className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-1.5"
					style={{ background: "linear-gradient(to top, var(--ret-bg), transparent)" }}
				/>
				{/* Carousel */}
				<span className="absolute inset-0 overflow-hidden">
					{AGENTS.map((a, idx) => {
						const offset = ((idx - activeIdx + AGENTS.length) % AGENTS.length);
						const y = offset === 0
							? 0
							: offset === 1 || (offset === AGENTS.length - 1 ? -1 : offset) === AGENTS.length - 1
								? -1
								: 1;
						const isActive = idx === activeIdx;
						const isPrev = idx === (activeIdx - 1 + AGENTS.length) % AGENTS.length;
						const isNext = idx === (activeIdx + 1) % AGENTS.length;

						let translateY = "100%";
						let opacity = 0;

						if (isActive) {
							translateY = "0%";
							opacity = 1;
						} else if (isPrev) {
							translateY = "-120%";
							opacity = 0;
						} else if (isNext) {
							translateY = "120%";
							opacity = 0;
						}

						return (
							<span
								key={a.mark}
								className="absolute inset-0 flex items-center justify-center"
								style={{
									transition: `transform ${dur} cubic-bezier(0.4, 0, 0.2, 1), opacity ${dur} cubic-bezier(0.4, 0, 0.2, 1)`,
									transform: `translateY(${translateY})`,
									opacity,
								}}
							>
								<Logo mark={a.mark} size={size} />
							</span>
						);
					})}
				</span>
			</span>
		</span>
	);
}
