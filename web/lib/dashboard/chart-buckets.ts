/**
 * Bucket records by local calendar day for dashboard bar charts.
 */

function localDateKey(value: string | Date): string {
	const d = typeof value === "string" ? new Date(value) : value;
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function bucketByDay<T extends { createdAt: string }>(
	items: T[],
	days: number,
): { date: string; count: number }[] {
	const now = new Date();
	const buckets: Record<string, number> = {};
	for (let i = days - 1; i >= 0; i--) {
		const d = new Date(now);
		d.setHours(12, 0, 0, 0);
		d.setDate(d.getDate() - i);
		buckets[localDateKey(d)] = 0;
	}
	for (const item of items) {
		const key = localDateKey(item.createdAt);
		if (key in buckets) buckets[key]++;
	}
	return Object.entries(buckets).map(([date, count]) => ({ date, count }));
}
