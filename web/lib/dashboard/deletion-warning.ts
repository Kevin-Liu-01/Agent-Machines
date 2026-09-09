export const VERCEL_SNAPSHOT_CLEANUP_URL = "https://vercel.com/docs/sandbox/concepts/snapshots#delete-a-snapshot";

/** Deleting a sandbox does not delete its separately billed Vercel snapshots. */
export function deletionStorageWarning(provider?: string | null): string | null {
	return provider === "vercel"
		? "Vercel snapshots are not deleted with this Worker. They remain in Vercel and may incur storage charges until you explicitly remove them there."
		: null;
}

export function deletionConfirmation(message: string, provider?: string | null): string {
	const warning = deletionStorageWarning(provider);
	return warning ? `${message}\n\n${warning}` : message;
}
