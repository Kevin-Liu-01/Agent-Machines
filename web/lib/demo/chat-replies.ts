/**
 * Demo chat intent routing + natural-language formatters.
 * Reads machine narrative data and turns it into conversational replies.
 */

import type { CursorRun, LogLine } from "@/lib/dashboard/types";

import type { MachineNarrative } from "./config";
import { getMachineNarrative, resolveDemoMachineId } from "./machine-narratives";

export type DemoChatIntent =
	| "greeting"
	| "ack"
	| "show_cursor"
	| "show_logs"
	| "show_sessions"
	| "show_artifacts"
	| "show_usage"
	| "show_summary"
	| "help"
	| "security_audit"
	| "save_skill"
	| "pr_review"
	| "wiki_digest"
	| "ops_health"
	| "product_pitch"
	| "show_harness"
	| "fallback";

const GREETING_RE =
	/^(hi|hello|hey|yo|sup|howdy|hiya|good\s+(morning|afternoon|evening)|what'?s\s+up)[!.?\s]*$/i;
const ACK_RE =
	/^(nice|cool|thanks|thank\s+you|ok|okay|great|got\s+it|sweet|perfect|awesome|good|yep|yeah|sure)[!.?\s]*$/i;

function normalize(text: string): string {
	return text.trim().replace(/\s+/g, " ");
}

function mentionsCursor(text: string): boolean {
	return /\bcursor(\s+runs?|\s+agents?)?\b/i.test(text) || /show\s+cursor/i.test(text);
}

function mentionsLogs(text: string): boolean {
	return /\blogs?\b/i.test(text) && !/catalog/i.test(text);
}

function mentionsSessions(text: string): boolean {
	return /\bsessions?\b/i.test(text);
}

function mentionsArtifacts(text: string): boolean {
	return /\bartifacts?\b|\bfiles?\b/i.test(text);
}

function mentionsUsage(text: string): boolean {
	return /\b(usage|metrics|cost|spend|billing)\b/i.test(text);
}

function mentionsSummary(text: string): boolean {
	return (
		/\b(summary|status|overview|what happened|what'?s on|recap|catch me up)\b/i.test(text) ||
		/^(what|anything)\s+(new|recent|latest)/i.test(text)
	);
}

function mentionsHelp(text: string): boolean {
	return /^(help|\?)$/i.test(text) || /\bwhat can you\b/i.test(text);
}

function mentionsProductPitch(text: string): boolean {
	return (
		/\b(agent machines|control plane|persistent agent|what is this|plain english)\b/i.test(text) ||
		/\bexplain\b.*\b(agent|machine|product|platform)\b/i.test(text) ||
		/\bwhy (is this|agent machines)\b/i.test(text)
	);
}

function mentionsHarness(text: string): boolean {
	return (
		/\b(skills|mcp|harness|tools)\b/i.test(text) &&
		/\b(list|show|what)\b/i.test(text)
	);
}

export function detectDemoChatIntent(message: string, machineId?: string): DemoChatIntent {
	const text = normalize(message);
	const lower = text.toLowerCase();
	const id = resolveDemoMachineId(machineId);

	if (GREETING_RE.test(text)) return "greeting";
	if (ACK_RE.test(text)) return "ack";
	if (mentionsHelp(text)) return "help";
	if (mentionsProductPitch(text)) return "product_pitch";
	if (mentionsHarness(text)) return "show_harness";

	if (mentionsCursor(text)) return "show_cursor";
	if (mentionsLogs(text)) return "show_logs";
	if (mentionsSessions(text)) return "show_sessions";
	if (mentionsArtifacts(text)) return "show_artifacts";
	if (mentionsUsage(text)) return "show_usage";
	if (mentionsSummary(text)) return "show_summary";

	if (lower.includes("security audit") || lower.includes("deepsec")) return "security_audit";
	if (lower.includes("save") && lower.includes("skill")) return "save_skill";

	if (
		id === "demo-code-review" &&
		(lower.includes("pr") || lower.includes("review") || lower.includes("412"))
	) {
		return "pr_review";
	}
	if (
		id === "demo-research" &&
		(lower.includes("wiki") || lower.includes("digest") || lower.includes("memory"))
	) {
		return "wiki_digest";
	}
	if (
		id === "demo-ops" &&
		(lower.includes("health") || lower.includes("cron") || lower.includes("hourly"))
	) {
		return "ops_health";
	}

	return "fallback";
}

function formatDuration(ms: number | null): string {
	if (ms === null || !Number.isFinite(ms)) return "—";
	if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
	const m = Math.floor(ms / 60_000);
	const s = Math.round((ms % 60_000) / 1000);
	return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatTime(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCursorRuns(runs: CursorRun[]): string {
	if (runs.length === 0) {
		return "No Cursor runs on this machine yet. Spin one up from the agent or ask for a task that delegates to Cursor.";
	}
	const lines = runs.map((run) => {
		const skills =
			run.loadedSkills.length > 0 ? `\n**Skills:** ${run.loadedSkills.join(", ")}` : "";
		return (
			`### ${run.runId} · ${run.status} · ${formatDuration(run.durationMs)}\n` +
			`**When:** ${formatTime(run.loggedAt)} · **Model:** ${run.model}\n` +
			`**Prompt:** ${run.prompt}\n` +
			`**Result:** ${run.finalText}${skills}`
		);
	});
	return `Here are the Cursor runs on this machine:\n\n${lines.join("\n\n")}`;
}

function formatLogs(lines: LogLine[]): string {
	if (lines.length === 0) return "Log tail is empty — machine is idle.";
	const tail = lines.slice(-12);
	const body = tail
		.map((l) => {
			const at = l.at ?? "";
			const stamp = at.length >= 19 ? at.slice(11, 19) : at;
			return `\`${stamp}\` **${l.level}** · ${l.source} — ${l.message}`;
		})
		.join("\n");
	return `Latest log lines:\n\n${body}`;
}

function formatSessions(narrative: MachineNarrative): string {
	const { sessions, totalBytes, totalSessions } = narrative.sessions;
	if (sessions.length === 0) return "No saved sessions yet.";
	const rows = sessions
		.map((s) => {
			const updated = s.updatedAt ?? "—";
			return `- **${s.id}** — ${s.preview} (${formatBytes(s.bytes)}, updated ${formatTime(updated)})`;
		})
		.join("\n");
	return (
		`**${totalSessions}** session${totalSessions === 1 ? "" : "s"} · ${formatBytes(totalBytes)} total\n\n${rows}`
	);
}

function formatArtifacts(narrative: MachineNarrative): string {
	if (narrative.artifacts.length === 0) {
		return "No artifacts yet. Run a task that writes output (audit, review, digest) and they'll show up here.";
	}
	const rows = narrative.artifacts
		.map(
			(a) =>
				`- **${a.name}** (${a.mime}, ${formatBytes(a.bytes)}) — ${formatTime(a.createdAt)}` +
				(a.chatId ? ` · chat \`${a.chatId}\`` : ""),
		)
		.join("\n");
	return `Artifacts on disk:\n\n${rows}`;
}

function formatUsage(narrative: MachineNarrative): string {
	const { cpu, memory, storage } = narrative.usage.resources;
	const recent = cpu.buckets.slice(-3);
	const bucketLines = recent
		.map((b) => `- ${b.date}: ${Math.round(b.vcpuSeconds / 3600)} vCPU·h`)
		.join("\n");
	const transitions = narrative.usage.transitions
		.slice(-4)
		.map((t) => `- ${t.label} (${formatTime(t.timestamp)})`)
		.join("\n");
	return (
		`Usage for **${narrative.machineId}** (last 7 days):\n\n` +
		`- **CPU:** ${Math.round(cpu.totalVcpuSeconds / 3600)} vCPU·hours\n` +
		`- **Memory:** ${Math.round(memory.totalGibSeconds / 3600)} GiB·hours\n` +
		`- **Storage:** ${storage.totalGibHours} GiB·hours\n\n` +
		`Recent days:\n${bucketLines}\n\n` +
		`Timeline:\n${transitions}`
	);
}

function machineGreeting(narrative: MachineNarrative): string {
	const hints: Record<string, string> = {
		"demo-fullstack":
			"Last thing here was the **security audit** — 12 findings, skill saved as `security-audit-repo`.",
		"demo-code-review":
			"Last thing here was the **PR #412 review** — three suggestions posted, tests added via Cursor.",
		"demo-research":
			"Last thing here was the **daily wiki digest** — five bullets merged into MEMORY.md.",
		"demo-ops":
			"Last thing here was the **hourly health check** — `/api/health` returned 502, issue **#847** opened.",
	};
	const lead =
		hints[narrative.machineId] ??
		`**${narrative.headline}** — full harness deployed (skills, MCP, cron, observation). No SSH required.`;
	return (
		`Hey — **${narrative.machineId.replace("demo-", "")}** is up.\n\n` +
		`${lead}\n\n` +
		`Ask "explain Agent Machines in plain English", "show the harness", or say **logs** / **cursor runs**.`
	);
}

function productPitch(): string {
	return (
		"**Agent Machines** ships the combined primitive the Bay is missing: a persistent **agent on a machine**, not a bare container and not a stateless framework.\n\n" +
		"- **Humans first:** visual dashboard — provision, watch tool calls, schedule cron, customize skills. Built for people who are not sysadmins.\n" +
		"- **Agents second (endgame):** MCP + CLI so a head agent provisions specialized workers and routes tasks across a fleet.\n" +
		"- **Market:** agent infra heading toward **$47B+** by 2028; control planes capture **10–30%** of spend — and enterprise vendors are still selling black-box UI, not true persistence.\n\n" +
		"You are looking at the layer that gives containers their primary use case: **persistent agents that work while you sleep.**"
	);
}

function harnessSummary(): string {
	return (
		"**Harness on this machine (demo):**\n\n" +
		"- **155** community skills (SKILL.md protocol)\n" +
		"- **17** MCP service integrations (Vercel, Stripe, Supabase, GitHub, …)\n" +
		"- **10+** closed-loop CLIs + browser automation + Cursor bridge\n" +
		"- **Cron** — agents run at 3am without a human prompt (see Cron panel)\n" +
		"- **Observation** — every tool call, skill, and dollar visible here\n\n" +
		"Switch machines in the fleet panel to see specialized agents (code review, research, ops)."
	);
}

function machineAck(narrative: MachineNarrative): string {
	const options: Record<string, string> = {
		"demo-fullstack": "Want the audit logs, cursor runs from the rate-limit fix, or the saved skill file?",
		"demo-code-review": "Want the PR review notes, cursor test run, or session transcript?",
		"demo-research": "Want the wiki digest artifact, MEMORY.md, or bookmark session list?",
		"demo-ops": "Want the health-check log, cursor investigation run, or cron trail?",
	};
	return options[narrative.machineId] ?? "What should we look at next — logs, sessions, cursor runs, or artifacts?";
}

function machineSummary(narrative: MachineNarrative): string {
	const { cursor, sessions, artifacts, logs } = narrative;
	return (
		`**${narrative.headline}**\n\n` +
		`- **Sessions:** ${sessions.totalSessions}\n` +
		`- **Cursor runs:** ${cursor.totalRuns}\n` +
		`- **Artifacts:** ${artifacts.length}\n` +
		`- **Log lines:** ${logs.lines.length}\n\n` +
		`Ask for any of those by name — e.g. "show cursor runs" or just "logs".`
	);
}

function machineHelp(): string {
	return (
		"I can show what's on this machine:\n\n" +
		"- **cursor runs** — delegated Cursor agent jobs\n" +
		"- **logs** — gateway + agent tail\n" +
		"- **sessions** — saved conversation state on disk\n" +
		"- **artifacts** — reports, diffs, MEMORY.md\n" +
		"- **usage** — CPU / memory / storage for the last week\n\n" +
		"Or just say hi — I'll catch you up on the last run."
	);
}

function machineFallback(narrative: MachineNarrative, userMessage: string): string {
	const short = normalize(userMessage).length <= 24;
	if (short) {
		return (
			`Not sure I follow "${userMessage}" — try **logs**, **cursor runs**, **sessions**, or **artifacts**. ` +
			`Last run here was **${narrative.headline}**.`
		);
	}
	return (
		`I don't have a scripted flow for that, but here's what's on this machine: **${narrative.headline}**.\n\n` +
		`Try "show cursor runs" or "logs" for the details from that session.`
	);
}

export function buildDemoChatReply(
	intent: DemoChatIntent,
	machineId?: string,
	userMessage = "",
): string {
	const id = resolveDemoMachineId(machineId);
	const narrative = getMachineNarrative(id);

	switch (intent) {
		case "greeting":
			return machineGreeting(narrative);
		case "ack":
			return machineAck(narrative);
		case "show_cursor":
			return formatCursorRuns(narrative.cursor.runs);
		case "show_logs":
			return formatLogs(narrative.logs.lines);
		case "show_sessions":
			return formatSessions(narrative);
		case "show_artifacts":
			return formatArtifacts(narrative);
		case "show_usage":
			return formatUsage(narrative);
		case "show_summary":
			return machineSummary(narrative);
		case "help":
			return machineHelp();
		case "product_pitch":
			return productPitch();
		case "show_harness":
			return harnessSummary();
		case "fallback":
			return machineFallback(narrative, userMessage);
		default:
			return machineFallback(narrative, userMessage);
	}
}

/** Intents that should stream a simple text reply (no multi-step task script). */
export function isConversationalIntent(intent: DemoChatIntent): boolean {
	return (
		intent === "greeting" ||
		intent === "ack" ||
		intent === "show_cursor" ||
		intent === "show_logs" ||
		intent === "show_sessions" ||
		intent === "show_artifacts" ||
		intent === "show_usage" ||
		intent === "show_summary" ||
		intent === "help" ||
		intent === "fallback"
	);
}

export function demoFetchToolLabel(intent: DemoChatIntent): { name: string; output: string } | null {
	switch (intent) {
		case "show_cursor":
			return { name: "list_cursor_runs", output: "Loaded cursor-runs.jsonl" };
		case "show_logs":
			return { name: "tail_logs", output: "Tailed gateway + agent logs" };
		case "show_sessions":
			return { name: "list_sessions", output: "Read sessions index" };
		case "show_artifacts":
			return { name: "list_artifacts", output: "Scanned ~/.agent-machines/artifacts" };
		case "show_usage":
			return { name: "fetch_usage", output: "Pulled 7-day usage metrics" };
		case "show_summary":
			return { name: "machine_status", output: "Summarized machine state" };
		default:
			return null;
	}
}
