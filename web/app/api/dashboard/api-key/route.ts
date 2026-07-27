import { auth, clerkClient } from "@clerk/nextjs/server";

import {
	asAgentMachinesApiKeyRecord,
	createAgentMachinesApiKey,
} from "@/lib/auth/agent-machines-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_FIELD = "agentMachinesApiKey";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

async function authenticatedUserId(): Promise<string | null> {
	try {
		return (await auth()).userId;
	} catch {
		return null;
	}
}

export async function GET(): Promise<Response> {
	const userId = await authenticatedUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	try {
		const client = await clerkClient();
		const user = await client.users.getUser(userId);
		const record = asAgentMachinesApiKeyRecord(user.privateMetadata[PRIVATE_FIELD]);
		return Response.json(
			{
				configured: Boolean(record),
				key: record
					? {
						prefix: record.prefix,
						lastFour: record.lastFour,
						createdAt: record.createdAt,
					}
					: null,
			},
			{ headers: NO_STORE_HEADERS },
		);
	} catch {
		return Response.json(
			{ error: "key_store_unavailable", message: "API key storage is unavailable." },
			{ status: 503 },
		);
	}
}

export async function POST(): Promise<Response> {
	const userId = await authenticatedUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	try {
		const { token, record } = createAgentMachinesApiKey(userId);
		const client = await clerkClient();
		await client.users.updateUserMetadata(userId, {
			privateMetadata: { [PRIVATE_FIELD]: record },
		});
		return Response.json(
			{
				ok: true,
				token,
				key: {
					prefix: record.prefix,
					lastFour: record.lastFour,
					createdAt: record.createdAt,
				},
			},
			{ headers: NO_STORE_HEADERS },
		);
	} catch {
		return Response.json(
			{ error: "key_create_failed", message: "Could not create the API key." },
			{ status: 503 },
		);
	}
}

export async function DELETE(): Promise<Response> {
	const userId = await authenticatedUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
	try {
		const client = await clerkClient();
		await client.users.updateUserMetadata(userId, {
			privateMetadata: { [PRIVATE_FIELD]: null },
		});
		return Response.json({ ok: true }, { headers: NO_STORE_HEADERS });
	} catch {
		return Response.json(
			{ error: "key_revoke_failed", message: "Could not revoke the API key." },
			{ status: 503 },
		);
	}
}
