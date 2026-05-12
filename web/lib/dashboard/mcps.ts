/**
 * Static MCP registry. The dashboard reads from this list to render the
 * MCPs page. The source of truth on the live machine is
 * `~/.agent-machines/config.toml` -- this file is the marketing-friendly
 * reflection, derived from `mcp/cursor-bridge/src/server.ts` and agent built-ins.
 *
 * Keep tool descriptions short and accurate. When the cursor-bridge tool
 * surface changes, mirror it here.
 */

import type { Mark } from "@/components/Logo";

import type { McpServerSummary } from "./types";

export type McpServerWithBrand = McpServerSummary & {
	brand?: Mark;
	owner?: string;
	link?: string;
};

const CURSOR_BRIDGE: McpServerWithBrand = {
	name: "cursor-bridge",
	transport: "stdio",
	source: "mcp/cursor-bridge/src/server.ts",
	brand: "cursor",
	owner: "Cursor",
	link: "https://cursor.com/docs/sdk/typescript",
	tools: [
		{
			name: "cursor_agent",
			title: "Spawn a Cursor coding agent",
			description:
				"Run a Cursor agent against a working dir for actual code changes. Inherits agent skill conventions through .cursor/rules.",
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
				"Enumerate skills in ~/.agent-machines/skills so the agent can pick which conventions to load when delegating.",
		},
		{
			name: "cursor_models",
			title: "List Cursor models",
			description:
				"Surface the Cursor models the API key has access to. Useful when picking model: { id } for an agent run.",
		},
	],
};

const HERMES_BUILTINS: McpServerWithBrand = {
	name: "hermes-builtins",
	transport: "stdio",
	source: "hermes-agent (NousResearch/hermes-agent)",
	brand: "nous",
	owner: "Nous Research",
	link: "https://github.com/NousResearch/hermes-agent",
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
				"Write or overwrite a file on the VM. Strict path checks keep writes inside ~/work and ~/.agent-machines by default.",
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

export function listMcpServers(): McpServerWithBrand[] {
	return [CURSOR_BRIDGE, HERMES_BUILTINS];
}
