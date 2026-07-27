/** Return true exactly once when a scheduler tick crosses a cadence boundary. */
export function isCadenceDue(
	nowMs: number,
	cadenceMs: number,
	tickMs: number,
): boolean {
	if (cadenceMs <= tickMs) return true;
	return (
		Math.floor(nowMs / cadenceMs) !==
		Math.floor((nowMs - tickMs) / cadenceMs)
	);
}
