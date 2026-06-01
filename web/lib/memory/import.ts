/**
 * Import an existing agent setup (a pasted CLAUDE.md / AGENTS.md / .cursor
 * rules / any system prompt) into a new memory bundle.
 *
 * v1 is deliberately simple and lossless: the whole blob becomes the agent
 * docs (the rules/instructions slot), which the editor lets you re-slice into
 * soul/memory/user. Section auto-splitting is a future enhancement.
 */

import type { MemoryBundle, MemoryBundleDocs } from "@/lib/user-config/schema";

import { newBundle } from "./bundle";

/** Heuristic: pull out a leading "# SOUL"/"# MEMORY"/"# USER" section when the
 *  paste clearly delimits them; otherwise everything is agent docs. */
function splitDocs(text: string): Partial<MemoryBundleDocs> {
	const trimmed = text.trim();
	const headerRe = /^#{1,3}\s*(soul|persona|memory|user|operator)\b/im;
	if (!headerRe.test(trimmed)) {
		return { agentDocs: trimmed };
	}
	const docs: Partial<MemoryBundleDocs> = {};
	const buckets: Record<string, string[]> = { soul: [], agentDocs: [], memory: [], user: [] };
	let current = "agentDocs";
	for (const line of trimmed.split("\n")) {
		const m = line.match(/^#{1,3}\s*(soul|persona|voice|agents?|rules|instructions|memory|user|operator)\b/i);
		if (m) {
			const k = m[1].toLowerCase();
			current =
				k === "soul" || k === "persona" || k === "voice"
					? "soul"
					: k === "memory"
						? "memory"
						: k === "user" || k === "operator"
							? "user"
							: "agentDocs";
			continue;
		}
		buckets[current].push(line);
	}
	for (const k of Object.keys(buckets)) {
		const body = buckets[k].join("\n").trim();
		if (body) docs[k as keyof MemoryBundleDocs] = body;
	}
	return docs;
}

export function bundleFromPaste(text: string, name?: string): MemoryBundle {
	return newBundle({
		name: name?.trim() || "Imported memory",
		description: "Imported from an existing agent setup.",
		docs: splitDocs(text),
		source: "imported",
	});
}
