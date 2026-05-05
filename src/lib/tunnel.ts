/**
 * Cloudflare quick tunnel fallback for Dedalus orgs that don't have preview
 * hostnames configured.
 *
 * `cloudflared tunnel --url http://localhost:8642` creates a free, anonymous
 * `*.trycloudflare.com` URL that proxies to the local port. No Cloudflare
 * account required. Ephemeral — regenerated on every start, which is fine
 * for a development demo.
 *
 * We install cloudflared into ~/.local/bin, start it via setsid, scrape the
 * public URL out of its log, and return it.
 */

import type Dedalus from "dedalus";

import {
	SHELL_ENV,
	VM_HERMES_HOME,
	VM_HOME,
	VM_LOCAL_BIN,
} from "./constants.js";
import { check, exec, execOut } from "./exec.js";

const CLOUDFLARED_BIN = `${VM_LOCAL_BIN}/cloudflared`;

export type TunnelInfo = { url: string; logPath: string };

async function ensureCloudflared(
	client: Dedalus,
	machineId: string,
): Promise<void> {
	if (await check(client, machineId, `[ -x ${CLOUDFLARED_BIN} ]`)) return;
	// 64-bit Linux binary, ~30 MB. AMD64 is the only arch Dedalus dev
	// machines currently expose; if that ever changes we'd need uname -m here.
	await exec(
		client,
		machineId,
		`mkdir -p ${VM_LOCAL_BIN} && curl -fsSL ` +
			"https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 " +
			`-o ${CLOUDFLARED_BIN} && chmod +x ${CLOUDFLARED_BIN} && ${CLOUDFLARED_BIN} --version`,
		{ timeoutMs: 180_000 },
	);
}

export async function startQuickTunnel(args: {
	client: Dedalus;
	machineId: string;
	port: number;
	name: string;
}): Promise<TunnelInfo> {
	const { client, machineId, port, name } = args;
	await ensureCloudflared(client, machineId);

	const logPath = `${VM_HERMES_HOME}/logs/cloudflared-${name}.log`;
	const pidPath = `${VM_HERMES_HOME}/logs/cloudflared-${name}.pid`;

	if (await check(client, machineId, `[ -f ${pidPath} ] && kill -0 $(cat ${pidPath}) 2>/dev/null`)) {
		const existing = await execOut(
			client,
			machineId,
			`grep -oE 'https://[a-z0-9-]+\\.trycloudflare\\.com' ${logPath} | head -1`,
		);
		if (existing) return { url: existing.trim(), logPath };
	}

	// Write a launcher script so `setsid bash` can fully detach without the
	// parent shell waiting on the cloudflared process. The same pattern works
	// for the gateway and dashboard launchers.
	const launcher = `${VM_HOME}/start-tunnel-${name}.sh`;
	const launcherBody = [
		"#!/bin/bash",
		`exec ${CLOUDFLARED_BIN} tunnel --no-autoupdate ` +
			`--url http://127.0.0.1:${port} --metrics 127.0.0.1:0 ` +
			`>> ${logPath} 2>&1`,
	].join("\\n");
	await exec(
		client,
		machineId,
		`mkdir -p ${VM_HERMES_HOME}/logs && rm -f ${logPath} && ` +
			`printf '%b' '${launcherBody}' > ${launcher} && chmod +x ${launcher}`,
	);
	await exec(
		client,
		machineId,
		`(setsid ${launcher} </dev/null &>/dev/null & echo $! > ${pidPath}) && disown -a 2>/dev/null || true`,
		{ timeoutMs: 15_000 },
	);

	// Wait for the trycloudflare URL to appear in the log. Cloudflared prints
	// it within a few seconds; we poll for up to 60s.
	for (let attempt = 0; attempt < 30; attempt++) {
		await new Promise((resolve) => setTimeout(resolve, 2_000));
		const url = await execOut(
			client,
			machineId,
			`grep -oE 'https://[a-z0-9-]+\\.trycloudflare\\.com' ${logPath} | head -1 || true`,
		);
		if (url) return { url: url.trim(), logPath };
	}

	const tail = await execOut(client, machineId, `tail -50 ${logPath} || true`);
	throw new Error(`cloudflared tunnel did not announce a URL.\nLog tail:\n${tail}`);
}

export async function stopTunnel(args: {
	client: Dedalus;
	machineId: string;
	name: string;
}): Promise<void> {
	const pidPath = `${VM_HERMES_HOME}/logs/cloudflared-${args.name}.pid`;
	await exec(
		args.client,
		args.machineId,
		`[ -f ${pidPath} ] && kill $(cat ${pidPath}) 2>/dev/null && rm -f ${pidPath} || true`,
	);
}
