/**
 * Static MCP registry. The dashboard reads from this list to render the
 * MCPs page. The source of truth on the live machine is
 * `~/.hermes/config.toml` -- this file is the marketing-friendly reflection,
 * derived from `mcp/cursor-bridge/src/server.ts` and the Hermes built-ins.
 *
 * Keep tool descriptions short and accurate. When the cursor-bridge tool
 * surface changes, mirror it here.
 */

import type { McpServerSummary } from "./types";

const CURSOR_BRIDGE: McpServerSummary = {
	name: "cursor-bridge",
	transport: "stdio",
	source: "mcp/cursor-bridge/src/server.ts",
	tools: [
		{
			name: "cursor_agent",
			title: "Spawn a Cursor coding agent",
			description:
				"Run a Cursor agent against a working dir for actual code changes. Inherits Hermes skill conventions through .cursor/rules.",
		},
		{
			name: "cursor_resume",
			title: "Resume an agent by id",
			description:
				"Continue a previous Cursor agent run with a follow-up prompt. Reuses session history and inherited skills.",
		},
		{
			name: "cursor_list_skills",
			title: "List skills available for injection",
			description:
				"Enumerate skills in ~/.hermes/skills so the agent can pick which conventions to load when delegating.",
		},
		{
			name: "cursor_models",
			title: "List Cursor models",
			description:
				"Surface the Cursor models the API key has access to. Useful when picking model: { id } for an agent run.",
		},
	],
};

const HERMES_BUILTINS: McpServerSummary = {
	name: "hermes-builtins",
	transport: "stdio",
	source: "hermes-agent (NousResearch/hermes-agent)",
	tools: [
		{
			name: "shell_exec",
			title: "Run a shell command",
			description:
				"Execute commands in the VM's shell. Output is streamed back. Used for git, tests, file ops, system inspection.",
		},
		{
			name: "fs_read",
			title: "Read a file",
			description:
				"Read a file from the VM filesystem with optional offset/limit. Bounded output to avoid context blowup.",
		},
		{
			name: "fs_write",
			title: "Write a file",
			description:
				"Write or overwrite a file on the VM. Strict path checks keep writes inside ~/work and ~/.hermes by default.",
		},
		{
			name: "browser_use",
			title: "Drive a Playwright browser",
			description:
				"Navigate, click, type, screenshot. Stays inside the configured allowlist of domains.",
		},
		{
			name: "cron_create",
			title: "Schedule a recurring task",
			description:
				"Register a new cron entry with prompt + cron expression + skills. Persisted across machine sleep/wake.",
		},
		{
			name: "session_memory",
			title: "Persist session memory",
			description:
				"Append durable facts to MEMORY.md so future conversations have context without re-explaining.",
		},
	],
};

export function listMcpServers(): McpServerSummary[] {
	return [CURSOR_BRIDGE, HERMES_BUILTINS];
}
