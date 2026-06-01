/**
 * Read the actual persona/memory doc *contents* off a machine (the canonical
 * `~/.agent-machines` root), so the bundle editor can show what's installed
 * and diff it against the bundle. The introspection command only reports char
 * counts; this returns full text. Base64 per file avoids delimiter collisions.
 */

import { execOnMachine } from "@/lib/dashboard/exec";

export const MEMORY_DOC_KEYS = ["soul", "agentDocs", "memory", "user"] as const;
export type MemoryDocKey = (typeof MEMORY_DOC_KEYS)[number];
export type OnMachineDocs = Record<MemoryDocKey, string>;

const FILE: Record<MemoryDocKey, string> = {
	soul: "SOUL.md",
	agentDocs: "AGENTS.md",
	memory: "MEMORY.md",
	user: "USER.md",
};

export async function readMemoryFromMachine(
	machineId: string,
): Promise<OnMachineDocs> {
	const cmd = MEMORY_DOC_KEYS.map(
		(k) =>
			`printf '@@AM:%s@@\\n' '${k}'; [ -f "$HOME/.agent-machines/${FILE[k]}" ] && base64 "$HOME/.agent-machines/${FILE[k]}" | tr -d '\\n'; printf '\\n'`,
	).join("; ");

	const res = await execOnMachine(cmd, { machineId, timeoutMs: 15_000 });

	const out: OnMachineDocs = { soul: "", agentDocs: "", memory: "", user: "" };
	const parts = res.stdout.split(/@@AM:(\w+)@@\n/);
	for (let i = 1; i < parts.length; i += 2) {
		const key = parts[i] as MemoryDocKey;
		const b64 = (parts[i + 1] ?? "").trim();
		if (MEMORY_DOC_KEYS.includes(key)) {
			try {
				out[key] = b64 ? Buffer.from(b64, "base64").toString("utf8") : "";
			} catch {
				out[key] = "";
			}
		}
	}
	return out;
}
