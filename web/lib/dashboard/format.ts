/**
 * Tiny formatters used across the PR2 dashboard pages. Centralized so the
 * dashboard speaks one language for bytes, ages, and durations.
 */

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
}

export function formatAge(iso: string | null): string {
	if (!iso) return "--";
	const ts = Date.parse(iso);
	if (Number.isNaN(ts)) return iso;
	const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	return `${days}d ago`;
}

export function formatDuration(ms: number | null | undefined): string {
	if (ms == null) return "--";
	if (ms < 1000) return `${ms} ms`;
	const seconds = ms / 1000;
	if (seconds < 60) return `${seconds.toFixed(1)} s`;
	const minutes = Math.floor(seconds / 60);
	const remainder = Math.round(seconds % 60);
	return `${minutes}m ${remainder}s`;
}
