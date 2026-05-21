/**
 * Generate a Python script that merges MCP server entries into
 * ~/.agent-machines/config.yaml. Hermes runtime reads mcp_servers at gateway startup.
 */

import type { McpCatalogEntry } from "./mcp-catalog.js";
import { VM_APP_HOME, VM_BRIDGE_DIR, VM_HERMES_HOME, VM_HOME, VM_NODE_DIR, VM_NPM_PREFIX } from "./constants.js";

export type McpRegisterContext = {
	hermesHome: string;
	nodeBin: string;
	npxBin: string;
	bridgeDir: string;
	envFiles: string[];
};

type ResolvedServer = {
	key: string;
	command: string;
	args: string[];
	env: Record<string, string>;
	timeout: number;
	requiredEnv: string[];
};

function substitute(template: string, ctx: McpRegisterContext): string {
	return template
		.replace(/\{\{VM_HERMES_HOME\}\}/g, ctx.hermesHome)
		.replace(/\{\{VM_BRIDGE_DIR\}\}/g, ctx.bridgeDir)
		.replace(/\{\{VM_NODE_BIN\}\}/g, ctx.nodeBin)
		.replace(/\{\{VM_NPM_BIN\}\}/g, ctx.npxBin)
		.replace(/\{\{VM_HOME\}\}/g, VM_HOME);
}

function parseNpxInstall(installCommand: string, ctx: McpRegisterContext): { command: string; args: string[] } {
	const parts = installCommand.trim().split(/\s+/);
	if (parts[0] === "npx") {
		const args = parts[1] === "-y" ? parts.slice(2) : parts.slice(1);
		return { command: ctx.npxBin, args };
	}
	return { command: parts[0] ?? ctx.npxBin, args: parts.slice(1) };
}

function resolveServer(entry: McpCatalogEntry, ctx: McpRegisterContext): ResolvedServer | null {
	const requiredEnv = entry.requiredEnv ?? [];

	if (entry.id === "cursor") {
		const command = substitute(entry.command ?? ctx.nodeBin, ctx);
		const args = (entry.args ?? []).map((a) => substitute(a, ctx));
		const env: Record<string, string> = {};
		for (const [k, v] of Object.entries(entry.env ?? {})) {
			env[k] = substitute(v, ctx);
		}
		return {
			key: "cursor",
			command,
			args,
			env,
			timeout: 600,
			requiredEnv: ["CURSOR_API_KEY"],
		};
	}

	if (entry.id === "playwright") {
		return {
			key: "playwright",
			command: ctx.npxBin,
			args: ["-y", "@playwright/mcp"],
			env: { PLAYWRIGHT_BROWSERS_PATH: `${VM_HOME}/.cache/ms-playwright` },
			timeout: 120,
			requiredEnv: [],
		};
	}

	if (entry.tier !== "bundled" || !entry.installCommand) return null;

	const { command, args } = parseNpxInstall(entry.installCommand, ctx);
	return {
		key: entry.id,
		command: substitute(command, ctx),
		args: args.map((a) => substitute(a, ctx)),
		env: {},
		timeout: 120,
		requiredEnv,
	};
}

export function buildMcpRegisterScript(
	entries: McpCatalogEntry[],
	ctx: McpRegisterContext,
): string {
	const resolved = entries
		.map((e) => resolveServer(e, ctx))
		.filter((s): s is ResolvedServer => s !== null);

	const lines = [
		"import os, yaml",
		`config_path = ${JSON.stringify(`${ctx.hermesHome}/config.yaml`)}`,
		`env_paths = ${JSON.stringify(ctx.envFiles)}`,
		"merged_env = {}",
		"for p in env_paths:",
		"    if not os.path.exists(p):",
		"        continue",
		"    for line in open(p):",
		"        line = line.strip()",
		"        if not line or line.startswith('#') or '=' not in line:",
		"            continue",
		"        k, _, v = line.partition('=')",
		"        merged_env[k.strip()] = v.strip()",
		"data = yaml.safe_load(open(config_path).read()) if os.path.exists(config_path) else {}",
		"data.setdefault('mcp_servers', {})",
	];

	for (const server of resolved) {
		const block = [
			`    'command': ${JSON.stringify(server.command)},`,
			`    'args': ${JSON.stringify(server.args)},`,
			`    'env': ${JSON.stringify(server.env)},`,
			`    'timeout': ${server.timeout},`,
		];
		if (server.requiredEnv.length === 0) {
			lines.push(`data['mcp_servers'][${JSON.stringify(server.key)}] = {`);
			lines.push(...block);
			lines.push("}");
			continue;
		}
		const checks = server.requiredEnv.map((k) => `merged_env.get('${k}')`).join(" and ");
		lines.push(`if ${checks}:`);
		lines.push(`    data['mcp_servers'][${JSON.stringify(server.key)}] = {`);
		lines.push(...block.map((l) => `    ${l}`));
		lines.push("    }");
	}

	lines.push("open(config_path, 'w').write(yaml.safe_dump(data, sort_keys=False))");
	lines.push("registered = len(data.get('mcp_servers', {}))");
	lines.push("print(f'registered {registered} mcp_servers')");

	return lines.join("\n");
}

export function defaultMcpRegisterContext(): McpRegisterContext {
	return {
		hermesHome: VM_HERMES_HOME,
		nodeBin: `${VM_NODE_DIR}/bin/node`,
		npxBin: `${VM_NPM_PREFIX}/bin/npx`,
		bridgeDir: VM_BRIDGE_DIR,
		envFiles: [`${VM_HERMES_HOME}/.env`, `${VM_APP_HOME}/.env`],
	};
}
