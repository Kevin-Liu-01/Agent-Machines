/**
 * `npm run deploy` -- provision (or wake), bootstrap, and expose a Hermes Agent.
 *
 * The deploy is idempotent in three layers:
 *   1. State file. If a machine ID is recorded, we wake it instead of creating.
 *   2. Phase guards. Each bootstrap phase short-circuits when its work exists.
 *   3. Preview create. Hermes preview create is naturally idempotent per port.
 *
 * On success we print the public API URL, the dashboard URL, the API key,
 * and a one-line `npm run chat -- "..."` example. The state file is updated
 * so subsequent CLI commands reuse the same machine without re-deploying.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runBootstrap } from "../lib/bootstrap.js";
import {
	loadState,
	makeClient,
	saveState,
	type MachineState,
} from "../lib/client.js";
import {
	DEPLOY_VERSION,
	PORT_API,
	PORT_DASHBOARD,
} from "../lib/constants.js";
import { loadConfig } from "../lib/env.js";
import {
	createMachine,
	getMachine,
	wakeMachine,
	waitForRunning,
} from "../lib/machine.js";
import { probeApi, generateApiServerKey } from "../lib/api.js";
import { dim, header, info, phase, success, warn } from "../lib/progress.js";
import { startQuickTunnel } from "../lib/tunnel.js";

function repoRoot(): string {
	const here = fileURLToPath(import.meta.url);
	return resolve(here, "..", "..", "..");
}

type ExposureResult = { url: string; via: "preview" | "cloudflared" };

/**
 * Try the Dedalus preview first (cleanest URL, integrated with the platform).
 * Fall back to a cloudflared trycloudflare quick tunnel when the org doesn't
 * have a preview hostname suffix configured (returns 503 from the API).
 */
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

export async function deploy(): Promise<void> {
	const config = loadConfig();
	const client = makeClient(config);
	const existing = loadState();
	const apiServerKey = existing?.apiServerKey ?? generateApiServerKey();

	header("Hermes Machines -- deploy");
	info(
		`Model: ${config.model}  ·  vCPU ${config.vcpu}  ·  ${config.memoryMib} MiB  ·  ${config.storageGib} GiB`,
	);

	const machineId = await phase("Provision or wake machine", async () => {
		if (existing?.machineId) {
			info(`  reusing machine ${existing.machineId}`);
			const machine = await getMachine(client, existing.machineId);
			if (machine.status.phase === "destroyed") {
				warn(`  recorded machine ${existing.machineId} is destroyed; creating a fresh one`);
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
		// createMachine already waits for `running`, so this returns immediately.
		const ready = await waitForRunning(client, created.machine_id, (p) =>
			dim(`  phase: ${p}`),
		);
		return ready.machine_id;
	});

	// Save state right after provisioning so a bootstrap failure doesn't orphan
	// the machine -- re-running deploy will resume against the same VM.
	saveState({
		machineId,
		apiServerKey,
		deployedAt: new Date().toISOString(),
		deployVersion: DEPLOY_VERSION,
		model: config.model,
	});

	await runBootstrap({
		client,
		machineId,
		config,
		apiServerKey,
		repoRoot: repoRoot(),
		cursorApiKey: config.cursorApiKey,
	});

	const apiExposure = await phase(
		`Expose API publicly (port ${PORT_API})`,
		() => exposePort({ client, machineId, port: PORT_API, name: "api" }),
	);
	const apiPreviewUrl = apiExposure.url;
	info(`  via ${apiExposure.via}`);

	let dashboardPreviewUrl = "";
	try {
		const dashExposure = await phase(
			`Expose dashboard publicly (port ${PORT_DASHBOARD})`,
			() =>
				exposePort({ client, machineId, port: PORT_DASHBOARD, name: "dash" }),
		);
		dashboardPreviewUrl = dashExposure.url;
		info(`  via ${dashExposure.via}`);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		warn(`  dashboard exposure skipped: ${message.slice(0, 200)}`);
	}

	const state: MachineState = {
		machineId,
		apiServerKey,
		apiPreviewUrl,
		dashboardPreviewUrl,
		deployedAt: new Date().toISOString(),
		deployVersion: DEPLOY_VERSION,
		model: config.model,
	};
	saveState(state);

	await phase("Probe API server health", async () => {
		const probe = await probeApi({ apiUrl: apiPreviewUrl, apiKey: apiServerKey });
		if (!probe.ok) {
			warn(`  /v1/models returned ${probe.status}: ${probe.body.slice(0, 200)}`);
			warn("  the gateway may still be warming; retry `npm run status` in 30s");
		} else {
			success(`  /v1/models OK (${probe.status})`);
		}
	});

	header("Ready");
	console.log(`  API URL:        ${apiPreviewUrl}/v1`);
	console.log(`  API Key:        ${apiServerKey}`);
	console.log(`  Dashboard:      ${dashboardPreviewUrl}`);
	console.log(`  Machine ID:     ${machineId}`);
	console.log("");
	console.log(`  Quick chat:     npm run chat -- "Say hi in one sentence."`);
	console.log(`  Curl:           curl ${apiPreviewUrl}/v1/chat/completions \\`);
	console.log(`                       -H "Authorization: Bearer ${apiServerKey}" \\`);
	console.log(`                       -H "Content-Type: application/json" \\`);
	console.log(`                       -d '{"model":"hermes-agent","messages":[{"role":"user","content":"hi"}]}'`);
	console.log("");
	console.log(`  Pause to save:  npm run sleep`);
	console.log(`  Resume:         npm run wake`);
	console.log(`  Permanently:    npm run destroy`);
}
