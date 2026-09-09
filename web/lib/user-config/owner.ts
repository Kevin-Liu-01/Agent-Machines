/** Deployment credentials belong only to an explicitly configured Clerk user. */
export function canUseDeploymentCredentials(userId: string): boolean {
	const ownerId = (
		process.env.AGENT_MACHINES_OWNER_USER_ID ??
		process.env.CLERK_OWNER_USER_ID ??
		""
	).trim();
	return Boolean(ownerId && userId === ownerId);
}
