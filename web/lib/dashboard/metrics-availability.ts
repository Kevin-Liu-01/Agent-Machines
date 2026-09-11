/** Public availability states: never expose database errors, URLs, or credentials. */
export type MetricsUnavailableReason = "config_missing" | "unavailable";

export const METRICS_AVAILABILITY_COPY = {
	config_missing: {
		title: "Usage storage is not configured",
		description: "Ask the deployment administrator to configure Supabase metrics storage and apply the database migrations, then retry. This is a deployment prerequisite, not a machine setting. No usage measurements are available from this request.",
	},
	unavailable: {
		title: "Usage data is unavailable",
		description: "The metrics service could not complete this request. Retry in a moment. If it continues, ask the deployment administrator to check metrics storage. This does not mean your usage is zero.",
	},
} as const;

export function metricsFailureReason(value: unknown): MetricsUnavailableReason {
	return value !== null && typeof value === "object" && "reason" in value && value.reason === "config_missing"
		? "config_missing" : "unavailable";
}

/** Match the known constructor prerequisite, not arbitrary database error text. */
export function missingMetricsStorage(error: unknown): boolean {
	return error instanceof Error && error.message.startsWith("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY.");
}

export function metricsUnavailableResponse(reason: MetricsUnavailableReason, status = 503): Response {
	return Response.json({ ok: false, reason, error: reason, message: METRICS_AVAILABILITY_COPY[reason].title }, {
		status, headers: { "Cache-Control": "no-store" },
	});
}
