/**
 * Agent Machines CLI dispatcher.
 *
 * Usage:
 *   npm run deploy
 *   npm run chat -- "your message"
 *   npm run status
 *   npm run logs [-- -n 200]
 *   npm run wake
 *   npm run sleep
 *   npm run destroy [-- --yes]
 *   npm run shell
 *   npm run reload
 *
 * Each command is a thin module under src/commands/.
 */

import { chat } from "./commands/chat.js";
import { deploy } from "./commands/deploy.js";
import { deployOpenclaw } from "./commands/deploy-openclaw.js";
import { destroy } from "./commands/destroy.js";
import { logs } from "./commands/logs.js";
import { reloadKnowledge } from "./commands/reload-knowledge.js";
import { reset } from "./commands/reset.js";
import { shell } from "./commands/shell.js";
import { sleep } from "./commands/sleep.js";
import { status } from "./commands/status.js";
import { wake } from "./commands/wake.js";

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
	deploy: () => deploy(),
	"deploy:openclaw": (args) => deployOpenclaw(args),
	chat: (args) => chat(args),
	status: () => status(),
	logs: (args) => logs(args),
	wake: () => wake(),
	sleep: () => sleep(),
	destroy: (args) => destroy(args),
	shell: () => shell(),
	"reload-knowledge": () => reloadKnowledge(),
	reset: () => reset(),
};

function help(): void {
	console.log("Agent Machines -- manage a persistent agent (Hermes / OpenClaw) on a provider (Dedalus today).");
	console.log("");
	console.log("Commands:");
	console.log("  deploy             Provision a machine and install Hermes (idempotent)");
	console.log("  deploy:openclaw    Install OpenClaw (alternative agent) on a machine");
	console.log('  chat "message"     Stream a single chat completion');
	console.log("  status             Machine phase, port bindings, API health");
	console.log("  logs [-n 200]      Tail the gateway log");
	console.log("  wake               Resume a sleeping machine");
	console.log("  sleep              Pause the machine (preserves state)");
	console.log("  destroy --yes      Permanently delete the machine");
	console.log("  shell              Print the dedalus ssh command");
	console.log("  reload-knowledge   Re-upload local knowledge/ to the machine");
	console.log("  reset              Wipe sessions/agent-state DB and restart the gateway");
}

async function main(): Promise<void> {
	const [command, ...rest] = process.argv.slice(2);
	if (!command || command === "--help" || command === "-h") {
		help();
		return;
	}
	const handler = COMMANDS[command];
	if (!handler) {
		console.error(`Unknown command: ${command}`);
		help();
		process.exit(1);
	}
	await handler(rest);
}

main().catch((err: unknown) => {
	const message = err instanceof Error ? err.message : String(err);
	console.error(`\n✗ ${message}`);
	process.exit(1);
});
