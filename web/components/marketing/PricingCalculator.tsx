"use client";

import { Cpu, HardDrive, MemoryStick } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/lib/cn";

type Mode = "second" | "hour";

const RATES = [
	{
		label: "CPU",
		unit: "vCPU-hour",
		hour: 0.0648,
		description: "Billed while the worker is active.",
		icon: Cpu,
	},
	{
		label: "Memory",
		unit: "GiB-hour",
		hour: 0.0072,
		description: "Based on reserved memory for the active worker.",
		icon: MemoryStick,
	},
	{
		label: "Storage",
		unit: "GiB-month",
		hour: 0.05,
		description: "Persistent volumes and artifacts.",
		icon: HardDrive,
	},
] as const;

function formatRate(value: number): string {
	if (value < 0.0001) return value.toFixed(7);
	if (value < 0.01) return value.toFixed(5);
	return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

export function PricingCalculator() {
	const [mode, setMode] = useState<Mode>("hour");
	const example = useMemo(() => {
		const activeHour = RATES[0].hour + RATES[1].hour * 2;
		return mode === "hour" ? activeHour : activeHour / 3600;
	}, [mode]);

	return (
		<div className="border border-[var(--ret-border-hover)] bg-[var(--ret-bg)]">
			<div className="flex flex-col gap-4 border-b border-[var(--ret-border)] p-5 md:flex-row md:items-center md:justify-between">
				<div>
					<h2 className="text-[18px] font-semibold tracking-tight text-[var(--ret-text)]">
						Compute model
					</h2>
					<p className="mt-1 text-[13px] text-[var(--ret-text-dim)]">
						Example lane. Actual provider rates and model usage can differ.
					</p>
				</div>
				<div className="relative grid grid-cols-2 border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-1">
					<span
						aria-hidden="true"
						className="ret-segmented-indicator absolute top-1 bottom-1 left-1 bg-[var(--ret-accent)]"
						style={{
							width: "calc(50% - 4px)",
							transform:
								mode === "hour" ? "translateX(calc(100% + 4px))" : "translateX(0)",
						}}
					/>
					<button
						type="button"
						aria-pressed={mode === "second"}
						onClick={() => setMode("second")}
						className={cn(
							"ret-pressable relative z-10 min-h-10 px-4 font-mono text-[13px]",
							mode === "second"
								? "text-[var(--ret-bg)]"
								: "text-[var(--ret-text-dim)] hover:text-[var(--ret-text)]",
						)}
					>
						Per second
					</button>
					<button
						type="button"
						aria-pressed={mode === "hour"}
						onClick={() => setMode("hour")}
						className={cn(
							"ret-pressable relative z-10 min-h-10 px-4 font-mono text-[13px]",
							mode === "hour"
								? "text-[var(--ret-bg)]"
								: "text-[var(--ret-text-dim)] hover:text-[var(--ret-text)]",
						)}
					>
						Per hour
					</button>
				</div>
			</div>
			<div className="divide-y divide-[var(--ret-border)]">
				{RATES.map((rate) => {
					const Icon = rate.icon;
					const shown = rate.label === "Storage"
						? rate.hour
						: mode === "hour"
							? rate.hour
							: rate.hour / 3600;
					const unit = rate.label === "Storage"
						? rate.unit
						: mode === "hour"
							? rate.unit
							: rate.unit.replace("hour", "second");
					return (
						<div
							key={rate.label}
							className="grid tabular-nums md:grid-cols-[64px_minmax(0,1fr)_180px]"
						>
							<div className="flex min-h-20 items-center justify-center border-b border-[var(--ret-border)] bg-[var(--ret-bg-soft)] md:border-b-0 md:border-r">
								<Icon className="h-5 w-5 text-[var(--ret-text-dim)]" strokeWidth={1.5} />
							</div>
							<div className="flex min-h-20 items-center px-4 py-4 md:px-5">
								<div>
									<h3 className="text-[15px] font-semibold text-[var(--ret-text)]">
										{rate.label}
									</h3>
									<p className="text-[13px] text-[var(--ret-text-dim)]">
										{rate.description}
									</p>
								</div>
							</div>
							<div className="border-t border-[var(--ret-border)] px-4 pb-4 font-mono md:border-l md:border-t-0 md:px-5 md:py-4 md:text-right">
								<p className="text-[24px] font-semibold text-[var(--ret-text)] md:text-[28px]">
									${formatRate(shown)}
								</p>
								<p className="text-[12px] text-[var(--ret-text-muted)]">
									/ {unit}
								</p>
							</div>
						</div>
					);
				})}
			</div>
			<div className="border-t border-[var(--ret-border)] p-5">
				<p className="text-[14px] leading-relaxed text-[var(--ret-text-dim)]">
					A 1 vCPU + 2 GiB worker is about{" "}
					<span className="font-mono text-[var(--ret-text)]">
						${formatRate(example)} / {mode}
					</span>{" "}
					while active in this example. Model tokens are tracked separately by
					the selected model path.
				</p>
			</div>
		</div>
	);
}
