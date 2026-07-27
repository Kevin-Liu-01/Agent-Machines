import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const KEY_PREFIX = "am_live_";

export type AgentMachinesApiKeyRecord = {
	hash: string;
	prefix: string;
	lastFour: string;
	createdAt: string;
};

export function createAgentMachinesApiKey(userId: string): {
	token: string;
	record: AgentMachinesApiKeyRecord;
} {
	const encodedUser = Buffer.from(userId, "utf8").toString("base64url");
	const secret = randomBytes(32).toString("base64url");
	const token = `${KEY_PREFIX}${encodedUser}.${secret}`;
	return {
		token,
		record: {
			hash: hashAgentMachinesApiKey(token),
			prefix: `${KEY_PREFIX}${encodedUser.slice(0, 6)}`,
			lastFour: token.slice(-4),
			createdAt: new Date().toISOString(),
		},
	};
}

export function userIdFromAgentMachinesApiKey(token: string): string | null {
	if (!token.startsWith(KEY_PREFIX)) return null;
	const separator = token.indexOf(".", KEY_PREFIX.length);
	if (separator < 0) return null;
	const encoded = token.slice(KEY_PREFIX.length, separator);
	const secret = token.slice(separator + 1);
	if (!encoded || secret.length < 32) return null;
	try {
		const userId = Buffer.from(encoded, "base64url").toString("utf8").trim();
		return userId && userId.length <= 256 ? userId : null;
	} catch {
		return null;
	}
}

export function hashAgentMachinesApiKey(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

export function agentMachinesApiKeyMatches(
	token: string,
	record: AgentMachinesApiKeyRecord | null | undefined,
): boolean {
	if (!record?.hash) return false;
	const actual = Buffer.from(hashAgentMachinesApiKey(token));
	const expected = Buffer.from(record.hash);
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function asAgentMachinesApiKeyRecord(
	value: unknown,
): AgentMachinesApiKeyRecord | null {
	if (!value || typeof value !== "object") return null;
	const record = value as Record<string, unknown>;
	if (
		typeof record.hash !== "string" ||
		typeof record.prefix !== "string" ||
		typeof record.lastFour !== "string" ||
		typeof record.createdAt !== "string"
	) {
		return null;
	}
	return record as AgentMachinesApiKeyRecord;
}
