"use client";

import { memo } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

import { cn } from "@/lib/cn";

type Props = {
	data: Record<string, unknown>[];
	dataKey: string;
	xKey?: string;
	color?: string;
	height?: number;
	xFormatter?: (value: string) => string;
	yFormatter?: (value: number) => string;
	peakValue?: number;
	peakLabel?: string;
};

export const DashboardBarChart = memo(function DashboardBarChart({
	data,
	dataKey,
	xKey = "date",
	color = "var(--ret-purple)",
	height = 200,
	xFormatter,
	yFormatter,
	peakValue,
	peakLabel,
}: Props) {
	if (!data.length) {
		return (
			<div
				className="flex items-center justify-center text-[12px] font-mono text-[var(--ret-text-muted)]"
				style={{ height }}
			>
				No data
			</div>
		);
	}

	const tickStyle = {
		fontSize: 10,
		fill: "var(--ret-text-muted)",
		fontFamily: "var(--font-mono)",
	};

	return (
		<ResponsiveContainer width="100%" height={height}>
			<BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
				<CartesianGrid
					stroke="var(--ret-line)"
					strokeDasharray="3 3"
					vertical={false}
				/>
				<XAxis
					dataKey={xKey}
					tick={tickStyle}
					tickLine={false}
					axisLine={false}
					tickFormatter={xFormatter}
				/>
				<YAxis
					tick={tickStyle}
					tickLine={false}
					axisLine={false}
					tickFormatter={yFormatter}
					allowDecimals={false}
					domain={[0, (max: number) => Math.max(max, 1)]}
				/>
				<Tooltip
					cursor={{ fill: "var(--ret-bg-soft)", opacity: 0.5 }}
					contentStyle={{
						backgroundColor: "var(--ret-bg)",
						border: "1px solid var(--ret-border)",
						borderRadius: 4,
						fontSize: 11,
						fontFamily: "var(--font-mono)",
						color: "var(--ret-text)",
					}}
				labelFormatter={(label) => xFormatter ? xFormatter(String(label)) : String(label)}
				formatter={(value: unknown) => {
					const v = Number(value);
					const label = yFormatter ? yFormatter(v) : String(v);
					return [label, "created"];
				}}
				/>
				<Bar
					dataKey={dataKey}
					fill={color}
					fillOpacity={0.6}
					radius={[2, 2, 0, 0]}
				/>
				{peakValue != null && (
					<ReferenceLine
						y={peakValue}
						stroke="var(--ret-red)"
						strokeDasharray="4 3"
						label={
							peakLabel
								? {
										value: peakLabel,
										position: "insideTopRight",
										fill: "var(--ret-red)",
										fontSize: 10,
										fontFamily: "var(--font-mono)",
									}
								: undefined
						}
					/>
				)}
			</BarChart>
		</ResponsiveContainer>
	);
});

export function formatDayShort(value: string): string {
	const d = new Date(value);
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDayOfWeek(value: string): string {
	const d = new Date(value + "T00:00:00");
	return d.toLocaleDateString("en-US", { weekday: "short" });
}
