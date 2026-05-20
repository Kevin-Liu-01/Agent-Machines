/**
 * Scripted SSE streams for stable chat / console recordings.
 */

import {
	buildDemoChatReply,
	demoFetchToolLabel,
	detectDemoChatIntent,
	isConversationalIntent,
	type DemoChatIntent,
} from "./chat-replies";
import { resolveDemoMachineId } from "./machine-narratives";

function sseBlock(event: string | undefined, data: unknown): string {
	const lines = event ? [`event: ${event}`] : [];
	lines.push(`data: ${typeof data === "string" ? data : JSON.stringify(data)}`);
	return `${lines.join("\n")}\n\n`;
}

function textChunk(content: string): string {
	return sseBlock("chat.completion.chunk", {
		choices: [{ delta: { content } }],
	});
}

function toolStart(id: string, name: string, args: Record<string, unknown>): string {
	return sseBlock("hermes.tool.start", {
		id,
		name,
		arguments: JSON.stringify(args),
	});
}

function toolDone(id: string, output: string): string {
	return sseBlock("hermes.tool.done", { id, output });
}

function sleepMs(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Split text into coarse blocks — word groups and line breaks. */
function blockyChunks(text: string, wordsPerBlock = 4): string[] {
	const chunks: string[] = [];
	const paragraphs = text.split(/\n\n+/);
	for (let p = 0; p < paragraphs.length; p++) {
		const lines = paragraphs[p].split("\n");
		for (let l = 0; l < lines.length; l++) {
			const tokens = lines[l].match(/\S+\s*/g) ?? [];
			for (let i = 0; i < tokens.length; i += wordsPerBlock) {
				chunks.push(tokens.slice(i, i + wordsPerBlock).join(""));
			}
			if (l < lines.length - 1) chunks.push("\n");
		}
		if (p < paragraphs.length - 1) chunks.push("\n\n");
	}
	return chunks;
}

async function* streamBlockyText(
	text: string,
	opts: { leadMs?: number; blockMs?: number; wordsPerBlock?: number } = {},
): AsyncGenerator<string> {
	const { leadMs = 900, blockMs = 180, wordsPerBlock = 4 } = opts;
	await sleepMs(leadMs);
	for (const block of blockyChunks(text, wordsPerBlock)) {
		yield textChunk(block);
		await sleepMs(blockMs + Math.floor(Math.random() * 80));
	}
}

async function* securityAuditStream(): AsyncGenerator<string> {
	await sleepMs(600);
	yield toolStart("tc-skill", "load_skill", { name: "deepsec" });
	await sleepMs(700);
	yield toolDone("tc-skill", "Loaded deepsec — 28 security rules");
	await sleepMs(500);

	yield toolStart("tc-browser", "browser_navigate", {
		url: "http://localhost:3210/dashboard",
	});
	await sleepMs(850);
	yield toolDone("tc-browser", "Page loaded — 200 OK");

	yield toolStart("tc-shell", "terminal_exec", {
		command: "npx deepsec --limit 50 ./web",
	});
	await sleepMs(950);
	yield toolDone("tc-shell", "Scan complete — 12 findings (2 high, 4 medium)");

	yield toolStart("tc-read", "read_file", { path: "web/app/api/chat/route.ts" });
	await sleepMs(700);
	yield toolDone("tc-read", "Read 84 lines");

	const report =
		"## Security audit complete\n\n" +
		"**12 findings** (2 high, 4 medium, 6 low)\n\n" +
		"- HIGH: Missing rate limit on `/api/chat`\n" +
		"- HIGH: Raw error bodies returned to client\n" +
		"- MEDIUM: CSP headers not set on dashboard\n\n" +
		"Full report saved to `artifacts/security-audit.md`.";
	yield* streamBlockyText(report, { leadMs: 1100, blockMs: 220, wordsPerBlock: 3 });
	yield sseBlock(undefined, "[DONE]");
}

async function* saveSkillStream(): AsyncGenerator<string> {
	await sleepMs(550);
	yield toolStart("tc-write", "write_file", {
		path: "knowledge/skills/custom/security-audit-repo/SKILL.md",
	});
	await sleepMs(800);
	yield toolDone(
		"tc-write",
		"Wrote SKILL.md — security-audit-repo v1.0.0",
	);
	await sleepMs(450);

	const body =
		"Saved **security-audit-repo** as a reusable skill.\n\n" +
		"```yaml\n" +
		"name: security-audit-repo\n" +
		"version: 1.0.0\n" +
		"triggers: [security audit, deepsec]\n" +
		"```\n\n" +
		"Skills library now at **156** procedures.";
	yield* streamBlockyText(body, { leadMs: 1000, blockMs: 200, wordsPerBlock: 3 });
	yield sseBlock(undefined, "[DONE]");
}

async function* prReviewStream(): AsyncGenerator<string> {
	await sleepMs(650);
	yield toolStart("tc-read", "read_file", { path: "web/lib/auth/middleware.ts" });
	await sleepMs(750);
	yield toolDone("tc-read", "Read 142 lines");
	yield toolStart("tc-cursor", "cursor_agent", {
		prompt: "Add unit tests for auth middleware",
	});
	await sleepMs(900);
	yield toolDone("tc-cursor", "8 tests added — all passing");
	const body =
		"## PR #412 review\n\n" +
		"**3 suggestions** posted:\n\n" +
		"- Add token expiry validation before decode\n" +
		"- Surface auth errors without leaking stack traces\n" +
		"- Expand test coverage for edge cases\n\n" +
		"Review saved to `artifacts/pr-412-review.md`.";
	yield* streamBlockyText(body, { leadMs: 1000, blockMs: 210, wordsPerBlock: 3 });
	yield sseBlock(undefined, "[DONE]");
}

async function* wikiDigestStream(): AsyncGenerator<string> {
	await sleepMs(600);
	yield toolStart("tc-reach", "agent_reach", { query: "bookmarks last 24h" });
	await sleepMs(850);
	yield toolDone("tc-reach", "12 pages fetched");
	yield toolStart("tc-write", "write_file", { path: "MEMORY.md" });
	await sleepMs(700);
	yield toolDone("tc-write", "5 bullets consolidated");
	const body =
		"## Daily wiki digest\n\n" +
		"**5 bullets** merged into MEMORY.md.\n\n" +
		"Full digest: `artifacts/wiki-digest-2026-05-20.md`.\n\n" +
		"Cross-links added to `wiki/_index.md`.";
	yield* streamBlockyText(body, { leadMs: 1100, blockMs: 200, wordsPerBlock: 3 });
	yield sseBlock(undefined, "[DONE]");
}

async function* opsHealthStream(): AsyncGenerator<string> {
	await sleepMs(550);
	yield toolStart("tc-http", "http_get", { url: "/api/health" });
	await sleepMs(800);
	yield toolDone("tc-http", "502 Bad Gateway — regression detected");
	yield toolStart("tc-gh", "github_issue", { title: "API health check failing" });
	await sleepMs(750);
	yield toolDone("tc-gh", "Opened issue #847");
	const body =
		"## Hourly health check\n\n" +
		"`GET /api/health` returned **502**.\n\n" +
		"Opened GitHub issue **#847**. Run cost: **$0.04**.\n\n" +
		"Log: `artifacts/cron-hourly-health-check.log`.";
	yield* streamBlockyText(body, { leadMs: 1000, blockMs: 200, wordsPerBlock: 3 });
	yield sseBlock(undefined, "[DONE]");
}

async function* conversationalStream(
	intent: DemoChatIntent,
	machineId?: string,
	userMessage = "",
): AsyncGenerator<string> {
	const tool = demoFetchToolLabel(intent);
	if (tool) {
		await sleepMs(400);
		yield toolStart(`tc-${intent}`, tool.name, {});
		await sleepMs(550);
		yield toolDone(`tc-${intent}`, tool.output);
		await sleepMs(350);
	}

	const body = buildDemoChatReply(intent, machineId, userMessage);
	const pacing =
		intent === "greeting" || intent === "ack"
			? { leadMs: 500, blockMs: 140, wordsPerBlock: 5 }
			: intent.startsWith("show_")
				? { leadMs: 650, blockMs: 160, wordsPerBlock: 4 }
				: { leadMs: 700, blockMs: 170, wordsPerBlock: 4 };

	yield* streamBlockyText(body, pacing);
	yield sseBlock(undefined, "[DONE]");
}

async function* defaultStream(machineId?: string, userMessage = ""): AsyncGenerator<string> {
	yield* conversationalStream("fallback", machineId, userMessage);
}

function pickScript(
	lastUserMessage: string,
	machineId?: string,
): AsyncGenerator<string> {
	const intent = detectDemoChatIntent(lastUserMessage, machineId);
	const id = resolveDemoMachineId(machineId);

	if (isConversationalIntent(intent)) {
		return conversationalStream(intent, id, lastUserMessage);
	}

	switch (intent) {
		case "security_audit":
			return securityAuditStream();
		case "save_skill":
			return saveSkillStream();
		case "pr_review":
			return prReviewStream();
		case "wiki_digest":
			return wikiDigestStream();
		case "ops_health":
			return opsHealthStream();
		default:
			return defaultStream(id, lastUserMessage);
	}
}

export function createDemoChatResponse(
	messages: Array<{ role: string; content: string }>,
	machineId?: string,
): Response {
	const lastUser = [...messages].reverse().find((m) => m.role === "user");
	const text = lastUser?.content ?? "";

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			try {
				for await (const chunk of pickScript(text, machineId)) {
					controller.enqueue(encoder.encode(chunk));
				}
			} catch {
				controller.enqueue(encoder.encode(sseBlock(undefined, "[DONE]")));
			}
			controller.close();
		},
	});

	return new Response(stream, {
		status: 200,
		headers: {
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
		},
	});
}
