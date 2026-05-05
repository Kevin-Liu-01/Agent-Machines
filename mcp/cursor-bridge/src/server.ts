#!/usr/bin/env node
/**
 * cursor-bridge -- an MCP server that exposes the Cursor SDK as Hermes tools.
 *
 * Hermes spawns this process via stdio and gets four tools:
 *   - cursor_agent       : run a Cursor agent against a local working dir
 *   - cursor_resume      : continue a previous Cursor agent by ID
 *   - cursor_list_skills : enumerate available Hermes skills for injection
 *   - cursor_models      : list Cursor models the API key has access to
 *
 * The bridge is intentionally one Node process. Every tool call resolves to a
 * fresh Cursor agent (`Agent.prompt` for one-shots, `Agent.create + send +
 * wait + dispose` for streaming) so we never leak agent handles or run stores.
 */

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

import { Agent, Cursor, CursorAgentError } from "@cursor/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const HERMES_HOME = process.env.HERMES_HOME ?? `${process.env.HOME}/.hermes`;
const SKILLS_DIR = `${HERMES_HOME}/skills`;
const DEFAULT_MODEL = "composer-2";

function readApiKey(): string {
	const key = process.env.CURSOR_API_KEY?.trim();
	if (!key) {
		throw new Error(
			"CURSOR_API_KEY is not set. Add it to ~/.hermes/.env (cursor.com/dashboard/integrations) and restart the gateway.",
		);
	}
	return key;
}

function listLocalSkills(): Array<{ name: string; path: string; description: string }> {
	if (!existsSync(SKILLS_DIR)) return [];
	const out: Array<{ name: string; path: string; description: string }> = [];
	for (const name of readdirSync(SKILLS_DIR)) {
		const skillPath = join(SKILLS_DIR, name, "SKILL.md");
		if (!existsSync(skillPath)) continue;
		try {
			const body = readFileSync(skillPath, "utf8");
			const match = body.match(/^description:\s*"?([^"\n]+)"?/m);
			out.push({
				name,
				path: skillPath,
				description: match ? match[1].trim() : "(no description)",
			});
		} catch {
			// Skip unreadable skill files; don't fail the whole listing.
		}
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Read each requested skill's body and write a single .cursor/rules/from-hermes.mdc
 * inside the working directory. Cursor's local runtime auto-loads .cursor/rules/*.mdc
 * when local.settingSources includes "project", so the spawned agent inherits
 * the same conventions Hermes itself follows. The synthetic file is removed
 * after the run completes.
 */
function injectSkills(args: {
	workingDir: string;
	skillNames: string[];
}): { ruleFilePath: string | null; loaded: string[] } {
	if (args.skillNames.length === 0) return { ruleFilePath: null, loaded: [] };

	const loaded: string[] = [];
	const sections: string[] = [
		"---",
		"description: Conventions inherited from the Hermes Agent that spawned this Cursor agent.",
		"alwaysApply: true",
		"---",
		"",
		"# Inherited Hermes Skills",
		"",
		"The Hermes Agent that spawned this Cursor agent runs under these conventions.",
		"Apply them to every change in this session.",
		"",
	];
	for (const name of args.skillNames) {
		const skillPath = join(SKILLS_DIR, name, "SKILL.md");
		if (!existsSync(skillPath)) continue;
		const body = readFileSync(skillPath, "utf8");
		// Strip the YAML frontmatter -- it's metadata for Hermes, not for the
		// model. The first H1 in the body becomes the section header.
		const stripped = body.replace(/^---[\s\S]*?---\s*/m, "").trim();
		sections.push(`## skill: ${name}`, "", stripped, "");
		loaded.push(name);
	}

	const rulesDir = join(args.workingDir, ".cursor", "rules");
	mkdirSync(rulesDir, { recursive: true });
	const ruleFilePath = join(rulesDir, "from-hermes.mdc");
	writeFileSync(ruleFilePath, sections.join("\n"));
	return { ruleFilePath, loaded };
}

function cleanupRuleFile(ruleFilePath: string | null): void {
	if (!ruleFilePath) return;
	try {
		rmSync(ruleFilePath, { force: true });
	} catch {
		// Cleanup is best-effort; a stale rule file is annoying but not dangerous.
	}
}

function ensureWorkingDir(workingDir: string): string {
	const abs = resolve(workingDir);
	mkdirSync(abs, { recursive: true });
	const stat = statSync(abs);
	if (!stat.isDirectory()) {
		throw new Error(`working_dir ${abs} exists but is not a directory`);
	}
	return abs;
}

type RunSummary = {
	agent_id: string;
	run_id: string;
	status: string;
	duration_ms: number | null;
	final_text: string;
	loaded_skills: string[];
	working_dir: string;
};

async function runOneShot(args: {
	prompt: string;
	workingDir: string;
	model: string;
	skillNames: string[];
}): Promise<RunSummary> {
	const apiKey = readApiKey();
	const workingDir = ensureWorkingDir(args.workingDir);
	const { ruleFilePath, loaded } = injectSkills({
		workingDir,
		skillNames: args.skillNames,
	});

	const agent = await Agent.create({
		apiKey,
		model: { id: args.model },
		local: { cwd: workingDir, settingSources: ["project"] },
	});

	let runId = "";
	let finalText = "";
	let durationMs: number | null = null;
	let status = "running";

	try {
		const run = await agent.send(args.prompt);
		runId = run.id;
		for await (const event of run.stream()) {
			if (event.type === "assistant" && Array.isArray(event.message?.content)) {
				for (const block of event.message.content) {
					if (block.type === "text") finalText += block.text;
				}
			}
		}
		const result = await run.wait();
		status = result.status;
		durationMs = result.durationMs ?? null;
		if (result.result) finalText = result.result;
	} finally {
		await agent[Symbol.asyncDispose]();
		cleanupRuleFile(ruleFilePath);
	}

	return {
		agent_id: agent.agentId,
		run_id: runId,
		status,
		duration_ms: durationMs,
		final_text: finalText,
		loaded_skills: loaded,
		working_dir: workingDir,
	};
}

async function resumeAndSend(args: {
	agentId: string;
	prompt: string;
	model: string;
	workingDir: string;
	skillNames: string[];
}): Promise<RunSummary> {
	const apiKey = readApiKey();
	const workingDir = ensureWorkingDir(args.workingDir);
	const { ruleFilePath, loaded } = injectSkills({
		workingDir,
		skillNames: args.skillNames,
	});

	const agent = await Agent.resume(args.agentId, {
		apiKey,
		model: { id: args.model },
		local: { cwd: workingDir, settingSources: ["project"] },
	});

	let runId = "";
	let finalText = "";
	let durationMs: number | null = null;
	let status = "running";

	try {
		const run = await agent.send(args.prompt);
		runId = run.id;
		for await (const event of run.stream()) {
			if (event.type === "assistant" && Array.isArray(event.message?.content)) {
				for (const block of event.message.content) {
					if (block.type === "text") finalText += block.text;
				}
			}
		}
		const result = await run.wait();
		status = result.status;
		durationMs = result.durationMs ?? null;
		if (result.result) finalText = result.result;
	} finally {
		await agent[Symbol.asyncDispose]();
		cleanupRuleFile(ruleFilePath);
	}

	return {
		agent_id: agent.agentId,
		run_id: runId,
		status,
		duration_ms: durationMs,
		final_text: finalText,
		loaded_skills: loaded,
		working_dir: workingDir,
	};
}

function asTextResult(payload: unknown): { content: Array<{ type: "text"; text: string }> } {
	const text =
		typeof payload === "string"
			? payload
			: JSON.stringify(payload, null, 2);
	return { content: [{ type: "text", text }] };
}

function asErrorResult(message: string): {
	content: Array<{ type: "text"; text: string }>;
	isError: true;
} {
	return { content: [{ type: "text", text: message }], isError: true };
}

const server = new McpServer({
	name: "cursor-bridge",
	version: "0.1.0",
});

server.registerTool(
	"cursor_agent",
	{
		title: "Spawn a Cursor coding agent",
		description: [
			"Spin up a Cursor coding agent against a local working directory and run one prompt.",
			"Use when the user asks for actual code changes -- refactors, bug fixes, new features,",
			"repo-level work -- that benefit from full file/terminal access and iterative tool calls.",
			"For pure-discussion answers stay in Hermes; for code that ships, hand off to Cursor.",
			"",
			"Pass `load_skills` to inherit Hermes skill conventions (e.g. agent-ethos, git-workflow).",
			"Each named skill becomes a .cursor/rules entry the spawned agent reads as project rules.",
			"",
			"Returns the agent_id (use with cursor_resume for follow-ups), run_id, status,",
			"duration, and the final assistant text.",
		].join(" "),
		inputSchema: {
			prompt: z
				.string()
				.min(1)
				.describe(
					"What you want the Cursor agent to do. Be specific about files, expected behavior, and acceptance criteria.",
				),
			working_dir: z
				.string()
				.describe(
					"Absolute path the Cursor agent will operate in. The directory will be created if it does not exist.",
				),
			model: z
				.string()
				.optional()
				.describe(`Cursor model id (default: ${DEFAULT_MODEL}). Use cursor_models to list options.`),
			load_skills: z
				.array(z.string())
				.optional()
				.describe(
					"Names of Hermes skills (folders in ~/.hermes/skills) whose SKILL.md should be injected as .cursor/rules for this run. Empty = no injection.",
				),
		},
	},
	async (input) => {
		try {
			const summary = await runOneShot({
				prompt: input.prompt,
				workingDir: input.working_dir,
				model: input.model ?? DEFAULT_MODEL,
				skillNames: input.load_skills ?? [],
			});
			return asTextResult(summary);
		} catch (err) {
			if (err instanceof CursorAgentError) {
				return asErrorResult(
					`CursorAgentError (retryable=${err.isRetryable}): ${err.message}`,
				);
			}
			const message = err instanceof Error ? err.message : String(err);
			return asErrorResult(`cursor_agent failed: ${message}`);
		}
	},
);

server.registerTool(
	"cursor_resume",
	{
		title: "Continue a previous Cursor agent",
		description:
			"Resume a Cursor agent by ID and send a follow-up prompt. The agent retains full conversation context. Use after cursor_agent to extend the same task without losing history.",
		inputSchema: {
			agent_id: z
				.string()
				.describe("Agent ID returned by a previous cursor_agent or cursor_resume call."),
			prompt: z.string().min(1).describe("The follow-up prompt."),
			working_dir: z
				.string()
				.describe("Absolute path; must match the original cursor_agent call."),
			model: z.string().optional().describe(`Cursor model id (default: ${DEFAULT_MODEL}).`),
			load_skills: z
				.array(z.string())
				.optional()
				.describe("Skills to inject as .cursor/rules (same semantics as cursor_agent)."),
		},
	},
	async (input) => {
		try {
			const summary = await resumeAndSend({
				agentId: input.agent_id,
				prompt: input.prompt,
				workingDir: input.working_dir,
				model: input.model ?? DEFAULT_MODEL,
				skillNames: input.load_skills ?? [],
			});
			return asTextResult(summary);
		} catch (err) {
			if (err instanceof CursorAgentError) {
				return asErrorResult(
					`CursorAgentError (retryable=${err.isRetryable}): ${err.message}`,
				);
			}
			const message = err instanceof Error ? err.message : String(err);
			return asErrorResult(`cursor_resume failed: ${message}`);
		}
	},
);

server.registerTool(
	"cursor_list_skills",
	{
		title: "List Hermes skills available for cursor_agent injection",
		description:
			"Returns the local skills under ~/.hermes/skills with their descriptions. Useful before calling cursor_agent so you know which skill names to pass to load_skills.",
		inputSchema: {},
	},
	async () => {
		const skills = listLocalSkills();
		return asTextResult({ skills, count: skills.length, skills_dir: SKILLS_DIR });
	},
);

server.registerTool(
	"cursor_models",
	{
		title: "List Cursor models",
		description:
			"Calls Cursor.models.list() to enumerate the models the configured CURSOR_API_KEY has access to. Returns the IDs and any available parameter presets.",
		inputSchema: {},
	},
	async () => {
		try {
			const apiKey = readApiKey();
			const models = await Cursor.models.list({ apiKey });
			return asTextResult({ models, count: models.length });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return asErrorResult(`cursor_models failed: ${message}`);
		}
	},
);

async function main(): Promise<void> {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	// connect() returns; the transport keeps the process alive until stdin closes.
}

main().catch((err) => {
	console.error(`cursor-bridge fatal: ${err instanceof Error ? err.message : err}`);
	process.exit(1);
});
