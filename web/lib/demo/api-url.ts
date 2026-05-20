/** Append machineId query param for demo-scoped dashboard API calls. */
export function withMachineId(path: string, machineId?: string | null): string {
	if (!machineId) return path;
	const sep = path.includes("?") ? "&" : "?";
	return `${path}${sep}machineId=${encodeURIComponent(machineId)}`;
}
