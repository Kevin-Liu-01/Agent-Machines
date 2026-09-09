/** Bound the guest process group, not just the provider's output connection. */
export function boundedConsoleCommand(command: string, timeoutMs: number): string {
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Console execution timeout is invalid.");
	const quoted = `'${command.replace(/'/g, "'\\''")}'`;
	return [
		`if ! command -v timeout >/dev/null 2>&1; then echo 'Bounded Console execution requires GNU timeout on the Worker; no work was started.' >&2; exit 127; fi`,
		`timeout --signal=TERM --kill-after=5s ${(timeoutMs / 1000).toFixed(3)}s bash -c ${quoted}`,
	].join("\n");
}
