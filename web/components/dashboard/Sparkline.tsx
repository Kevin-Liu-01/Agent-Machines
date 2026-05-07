"use client";

import { useMemo } from "react";

import { cn } from "@/lib/cn";

type Props = {
	values: number[];
	width?: number;
	height?: number;
	className?: string;
	stroke?: string;
	/**
	 * When set, draws a translucent fill below the line in `stroke`'s color.
	 */
	fill?: boolean;
	/**
	 * Optional baseline value to use as the y=0 reference. Defaults to
	 * the minimum of the dataset.
	 */
	baseline?: number;
	ariaLabel?: string;
};

/**
 * Tiny inline SVG sparkline. No deps. Sits inside a 1-3 line label so
 * the dashboard can show "latency over the last N polls" without
 * pulling in a chart library.
 */
export function Sparkline({
	values,
	width = 120,
	height = 28,
	className,
	stroke = "var(--ret-text)",
	fill = false,
	baseline,
	ariaLabel,
}: Props) {
	const path = useMemo(() => {
		if (values.length === 0) return "";
		const max = Math.max(...values);
		const min = baseline ?? Math.min(...values);
		const range = max - min || 1;
		const dx = values.length > 1 ? width / (values.length - 1) : 0;
		const points = values.map((v, i) => {
			const x = i * dx;
			const y = height - ((v - min) / range) * height;
			return `${x.toFixed(2)},${y.toFixed(2)}`;
		});
		return points.join(" ");
	}, [values, width, height, baseline]);

	const fillPath = useMemo(() => {
		if (!fill || values.length === 0) return "";
		return `M0,${height} L${path.replace(/ /g, " L")} L${width},${height} Z`;
	}, [fill, path, height, width, values.length]);

	if (values.length === 0) {
		return (
			<svg
				width={width}
				height={height}
				className={cn("inline-block", className)}
				aria-label={ariaLabel ?? "no data"}
				role="img"
			>
				<line
					x1={0}
					y1={height / 2}
					x2={width}
					y2={height / 2}
					stroke="var(--ret-border)"
					strokeWidth={1}
					strokeDasharray="2,2"
				/>
			</svg>
		);
	}

	return (
		<svg
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			className={cn("inline-block", className)}
			role="img"
			aria-label={ariaLabel}
		>
			{fill ? (
				<path d={fillPath} fill={stroke} fillOpacity={0.12} />
			) : null}
			<polyline
				points={path}
				stroke={stroke}
				strokeWidth={1.4}
				fill="none"
				vectorEffect="non-scaling-stroke"
			/>
			{values.length > 0 ? (
				<circle
					cx={width}
					cy={
						height -
						((values[values.length - 1] - (baseline ?? Math.min(...values))) /
							(Math.max(...values) - (baseline ?? Math.min(...values)) || 1)) *
							height
					}
					r={2}
					fill={stroke}
				/>
			) : null}
		</svg>
	);
}
