/**
 * `npm run deploy:openclaw [-- --machine <id>]` -- install OpenClaw on a Dedalus machine.
 *
 * Two modes:
 *   1. With `--machine <id>` (typical when chained from the wizard):
 *      install OpenClaw onto the existing machine, no provisioning.
 *   2. Without it: provision a new machine, then install OpenClaw.
 *
 * On success we print the public URL, the gateway endpoint, and the
 * model id. Idempotent -- re-running on the same machine short-circuits
 * each phase.
 *
 * Output URL goes through the same Dedalus-preview-then-Cloudflare-quick-tunnel
 * fallback as the Hermes deploy.
 */

import {
	loadState,
	makeClient,
	saveState,
	type MachineState,
} from "../lib/client.js";
import {
	DEPLOY_VERSION,
} from "../lib/constants.js";
import { loadConfig } from "../lib/env.js";
import {
	createMachine,
	getMachine,
	wakeMachine,
	waitForRunning,
} from "../lib/machine.js";
import { generateApiServerKey } from "../lib/api.js";
import { dim, header, info, phase, success, warn } from "../lib/progress.js";
import {
	PORT_OPENCLAW,
	runOpenclawBootstrap,
} from "../lib/openclaw-bootstrap.js";
import { startQuickTunnel } from "../lib/tunnel.js";

type ExposureResult = { url: string; via: "preview" | "cloudflared" };

async function exposePort(args: {
	client: ReturnType<typeof makeClient>;
	machineId: string;
	port: number;
	name: string;
}): Promise<ExposureResult> {
	try {
		const list = await args.client.machines.previews.list({
			machine_id: args.machineId,
		});
		const match = list.items?.find(
			(p) => p.port === args.port && p.status === "ready",
		);
		if (match?.url) return { url: match.url, via: "preview" };

		const created = await args.client.machines.previews.create({
			machine_id: args.machineId,
			port: args.port,
			protocol: "http",
			visibility: "public",
		});
		if (created.url) return { url: created.url, via: "preview" };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (!message.includes("preview hostname suffix")) throw err;
		warn(
			"  Dedalus previews are not configured for this org. Falling back to Cloudflare quick tunnel.",
		);
	}
	const tunnel = await startQuickTunnel({
		client: args.client,
		machineId: args.machineId,
		port: args.port,
		name: args.name,
	});
	return { url: tunnel.url, via: "cloudflared" };
}

function parseArgs(args: string[]): { explicitMachineId: string | null } {
	let explicitMachineId: string | null = null;
	for (let i = 0; i < args.length; i++) {
		if ((args[i] === "--machine" || args[i] === "-m") && args[i + 1]) {
			explicitMachineId = args[i + 1];
			i++;
		}
	}
	return { explicitMachineId };
}

export async function deployOpenclaw(args: string[]): Promise<void> {
	const { explicitMachineId } = parseArgs(args);
	const config = loadConfig();
	const client = makeClient(config);
	const existing = loadState();
	const apiServerKey = existing?.apiServerKey ?? generateApiServerKey();

	header("Agent Machines -- deploy openclaw");
	info(
		`Spec: vCPU ${config.vcpu}  ·  ${config.memoryMib} MiB  ·  ${config.storageGib} GiB`,
	);
	if (explicitMachineId) {
		info(`Targeting existing machine: ${explicitMachineId}`);
	}

	const machineId = await phase(
		"Provision or wake machine",
		async () => {
			const targetId = explicitMachineId ?? existing?.machineId;
			if (targetId) {
				info(`  using machine ${targetId}`);
				const machine = await getMachine(client, targetId);
				if (machine.status.phase === "destroyed") {
					if (explicitMachineId) {
						throw new Error(
							`machine ${explicitMachineId} is destroyed; provision a new one through /dashboard/setup first`,
						);
					}
					warn(`  recorded machine ${targetId} is destroyed; creating a fresh one`);
				} else {
					const ready = await wakeMachine(client, machine);
					return ready.machine_id;
				}
			}
			const created = await createMachine(
				client,
				{
					vcpu: config.vcpu,
					memoryMib: config.memoryMib,
					storageGib: config.storageGib,
				},
				{
					onAttempt: (event) => {
						if (event.event === "created") {
							info(`  attempt ${event.attempt}: created ${event.machineId}`);
						} else if (event.event === "transient_retry") {
							warn(
								`  attempt ${event.attempt} failed (transient): ${event.message?.slice(0, 140)}`,
							);
							dim("  destroying dead machine and retrying with backoff");
						}
					},
				},
			);
			const ready = await waitForRunning(client, created.machine_id, (p) =>
				dim(`  phase: ${p}`),
			);
			return ready.machine_id;
		},
	);

	saveState({
		machineId,
		apiServerKey,
		deployedAt: new Date().toISOString(),
		deployVersion: DEPLOY_VERSION,
		model: "anthropic/claude-sonnet-4-20250514",
	});

	const result = await runOpenclawBootstrap({
		client,
		machineId,
		llmApiKey: config.apiKey,
	});

	const exposure = await phase(
		`Expose OpenClaw publicly (port ${PORT_OPENCLAW})`,
		() =>
			exposePort({ client, machineId, port: PORT_OPENCLAW, name: "openclaw" }),
	);
	const apiPreviewUrl = exposure.url;
	info(`  via ${exposure.via}`);

	const state: MachineState = {
		machineId,
		apiServerKey,
		apiPreviewUrl,
		deployedAt: new Date().toISOString(),
		deployVersion: DEPLOY_VERSION,
		model: result.model,
	};
	saveState(state);

	header("OpenClaw ready");
	console.log(`  Gateway URL:    ${apiPreviewUrl}/v1`);
	console.log(`  Model:          ${result.model}`);
	console.log(`  Machine ID:     ${machineId}`);
	console.log(`  Logs:           ${result.logPath}`);
	console.log("");
	console.log("  Curl test:");
	console.log(
		`    curl ${apiPreviewUrl}/v1/chat/completions \\`,
	);
	console.log(`         -H "Content-Type: application/json" \\`);
	console.log(
		`         -d '{"model":"${result.model}","messages":[{"role":"user","content":"hi"}]}'`,
	);
	console.log("");
	console.log(
		"  To wire to /dashboard/chat: paste the URL + model into Vercel env",
	);
	console.log(
		"  (AGENT_API_URL, AGENT_API_KEY=any, AGENT_MODEL) and redeploy,",
	);
	console.log(
		"  or save them to your Clerk metadata via the setup wizard's review step.",
	);
}
