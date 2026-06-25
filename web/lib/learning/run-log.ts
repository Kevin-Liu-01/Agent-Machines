/**
 * Parser for the on-box cron run log (~/.agent-machines/cron/runs.jsonl).
 *
 * Kept dependency-light (no catalog/Supabase imports) so it is unit-testable
 * without the generated data files. Newer lines carry a nested `arm` object --
 * the routing arm snapshot embedded at dispatch (JSON-stringified + base64'd by
 * buildCronCommand, so model/router values are safely escaped). Legacy/backfill
 * lines have no `arm`, in which case the arm fields are left undefined and ingest
 * falls back to the machine's current config.
 */

export type RunLogEntry = {
	id: string;
	startedAt: string;
	finishedAt: string;
	exitCode: number;
	runtime?: string;
	substrate?: string;
	model?: string;
	/** string = a router preset/profile id; null = native/default; undefined = no snapshot. */
	router?: string | null;
};

type RawArm = { runtime?: unknown; substrate?: unknown; model?: unknown; router?: unknown };

export function parseRunLog(stdout: string): RunLogEntry[] {
	const out: RunLogEntry[] = [];
	for (const line of stdout.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("{")) continue;
		try {
			const o = JSON.parse(trimmed) as {
				id?: unknown;
				startedAt?: unknown;
				finishedAt?: unknown;
				exitCode?: unknown;
				arm?: unknown;
			};
			if (
				typeof o.id === "string" &&
				typeof o.startedAt === "string" &&
				typeof o.finishedAt === "string" &&
				typeof o.exitCode === "number"
			) {
				const arm = o.arm && typeof o.arm === "object" ? (o.arm as RawArm) : null;
				out.push({
					id: o.id,
					startedAt: o.startedAt,
					finishedAt: o.finishedAt,
					exitCode: o.exitCode,
					runtime: arm && typeof arm.runtime === "string" ? arm.runtime : undefined,
					substrate: arm && typeof arm.substrate === "string" ? arm.substrate : undefined,
					model: arm && typeof arm.model === "string" ? arm.model : undefined,
					router: arm
						? typeof arm.router === "string"
							? arm.router
							: arm.router === null
								? null
								: undefined
						: undefined,
				});
			}
		} catch {
			// skip malformed line
		}
	}
	return out;
}
