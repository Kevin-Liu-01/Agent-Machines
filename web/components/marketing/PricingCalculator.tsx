"use client";

import { Cpu, HardDrive, MemoryStick, ArrowRight, Clock3 } from "@/components/ui/icons";
import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

// Preserved illustrative rates from this page, not provider quotes or a billing API.
const RATES = [
	{ label: "CPU", unit: "vCPU-hour", hour: 0.0648, icon: Cpu },
	{ label: "Memory", unit: "GiB-hour", hour: 0.0072, icon: MemoryStick },
	{ label: "Storage", unit: "GiB-month", hour: 0.05, icon: HardDrive },
] as const;
type Inputs = { cpu: string; memory: string; hours: string };
export function illustrativeComputeEstimate({ cpu, memory, hours }: Inputs): number | null {
	const values = [cpu, memory, hours];
	if (values.some((value) => !value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0)) return null;
	if (!Number.isInteger(Number(cpu)) || Number(cpu) < 1 || Number(memory) < 0.25 || Number(cpu) > 128 || Number(memory) > 1024 || Number(hours) > 744) return null;
	return (Number(cpu) * RATES[0].hour + Number(memory) * RATES[1].hour) * Number(hours);
}
const INPUTS = [
	{ id: "cpu", label: "vCPUs", min: 1, max: 128, step: 1, Icon: Cpu },
	{ id: "memory", label: "Memory (GiB)", min: 0.25, max: 1024, step: 0.25, Icon: MemoryStick },
	{ id: "hours", label: "Active hours", min: 0, max: 744, step: 1, Icon: Clock3 },
] as const;

export function PricingCalculator() {
	const [inputs, setInputs] = useState<Inputs>({ cpu: "1", memory: "2", hours: "8" });
	const [mode, setMode] = useState<"hour" | "second">("hour");
	const estimate = illustrativeComputeEstimate(inputs);
	return <div className="overflow-hidden rounded-xl border border-[var(--ret-border)]/50">
		<div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,.7fr)]">
			<div className="p-5 md:p-7">
				<h3 className="text-lg font-semibold">Size a sample workload.</h3>
				<p className="mt-2 text-sm leading-6 text-[var(--ret-text-dim)]">Local calculation only. These inputs do not create or resize a machine.</p>
				<div className="mt-6 grid gap-4 sm:grid-cols-3">
					{INPUTS.map(({ id, label, min, max, step, Icon }) => <label key={id} className="min-w-0"><span className="mb-2 flex items-center gap-2 text-sm text-[var(--ret-text-dim)]"><Icon className="size-4" aria-hidden="true" />{label}</span><input type="number" min={min} max={max} step={step} value={inputs[id]} aria-describedby="estimate-guidance" onChange={(event) => setInputs((current) => ({ ...current, [id]: event.target.value }))} className="min-h-12 w-full rounded-md border border-[var(--ret-border)]/60 bg-[var(--ret-bg)] px-3 text-base tabular-nums outline-none focus:border-[var(--ret-purple)]" /></label>)}
				</div>
				<p id="estimate-guidance" className="mt-4 text-xs leading-6 text-[var(--ret-text-muted)]">Estimate range: 1–128 vCPUs, 0.25–1,024 GiB, and 0–744 hours. Actual provider limits differ.</p>
			</div>
			<div className="flex flex-col justify-center border-t border-[var(--ret-border)]/40 bg-[var(--ret-bg-soft)]/40 p-5 md:p-7 lg:border-l lg:border-t-0">
				<p className="text-sm text-[var(--ret-text-muted)]">Illustrative compute + memory</p>
				<output aria-live="polite" className="mt-3 text-4xl font-semibold tracking-tight text-[var(--ret-text)] tabular-nums">{estimate === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(estimate)}</output>
				<p className="mt-3 text-sm leading-6 text-[var(--ret-text-dim)]">{estimate === null ? "Enter values within the ranges shown to calculate an estimate." : "For the active hours entered. Excludes storage, network, model calls, taxes, and provider minimums."}</p>
			</div>
		</div>
		<div className="border-t border-[var(--ret-border)]/40 p-5 md:p-7">
			<div className="flex flex-wrap items-center justify-between gap-4"><h3 className="text-base font-semibold">Rates used in this example</h3><div className="flex gap-1 rounded-md border border-[var(--ret-border)]/50 p-1" role="group" aria-label="Rate units">{(["hour", "second"] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={cn("min-h-10 rounded px-3 text-sm focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]", mode === value ? "bg-[var(--ret-surface)] text-[var(--ret-text)]" : "text-[var(--ret-text-dim)] hover:bg-[var(--ret-bg-soft)]")}>Per {value}</button>)}</div></div>
			<dl className="mt-5 grid gap-5 sm:grid-cols-3">{RATES.map(({ label, hour, unit, icon: Icon }) => { const divisor = label !== "Storage" && mode === "second" ? 3600 : 1; return <div key={label} className="min-w-0"><dt className="flex items-center gap-2 text-sm text-[var(--ret-text-muted)]"><Icon className="size-4" aria-hidden="true" />{label}</dt><dd className="mt-2 text-base font-medium tabular-nums">${(hour / divisor).toFixed(divisor === 1 ? 4 : 7)}<span className="ml-1 text-xs font-normal text-[var(--ret-text-muted)]">/ {divisor === 1 ? unit : unit.replace("hour", "second")}</span></dd></div>; })}</dl>
			<p className="mt-5 text-sm leading-6 text-[var(--ret-text-dim)]">Not a live quote or an Agent Machines rate card. Storage remains monthly and is excluded from the total. Verify current pricing and minimum charges with your provider.</p>
			<Link href="/dashboard/benchmarks" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--ret-text)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-purple)]">Inspect provider references <ArrowRight className="size-4" aria-hidden="true" /></Link>
		</div>
	</div>;
}
