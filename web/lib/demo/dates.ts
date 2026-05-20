/**
 * Demo-relative dates so charts stay in range regardless of when you run dev:demo.
 */

/** ISO timestamp at noon local time, N calendar days before today. */
export function demoDaysAgo(days: number): string {
	const d = new Date();
	d.setHours(12, 0, 0, 0);
	d.setDate(d.getDate() - days);
	return d.toISOString();
}

/** Per-machine provision offsets (days ago) — spread across the 14d chart. */
export const DEMO_MACHINE_AGE_DAYS: Record<string, number> = {
	"demo-fullstack": 13,
	"demo-code-review": 9,
	"demo-research": 6,
	"demo-ops": 3,
};

export function demoCreatedAtForMachine(id: string): string {
	const days = DEMO_MACHINE_AGE_DAYS[id] ?? 7;
	return demoDaysAgo(days);
}
