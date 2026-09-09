#!/usr/bin/env node
/** Exercise the package consumers install, outside this workspace's resolution tree. */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
if (!existsSync(join(root, "dist/index.js"))) {
	throw new Error("SDK output is missing. Run pnpm build:sdk before pnpm verify:sdk.");
}

const scratch = mkdtempSync(join(tmpdir(), "agent-machines-package-"));

function run(command, args, cwd) {
	const result = spawnSync(command, args, { cwd, encoding: "utf8" });
	assert.equal(result.status, 0, `${command} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
	return result.stdout;
}

try {
	const [packed] = JSON.parse(run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", scratch], root));
	const consumer = join(scratch, "consumer");
	const installed = join(consumer, "node_modules/agent-machines");
	mkdirSync(installed, { recursive: true });
	run("tar", ["-xzf", join(scratch, packed.filename), "--strip-components=1", "-C", installed], scratch);

	const manifest = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
	for (const [subpath, conditions] of Object.entries(manifest.exports)) {
		for (const target of typeof conditions === "string" ? [conditions] : Object.values(conditions)) {
			assert.ok(existsSync(join(installed, target.replace("*", "state"))), `Missing packed export: ${subpath} → ${target}`);
		}
	}

	run(process.execPath, ["--input-type=module", "--eval", `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as sdk from 'agent-machines';
import * as mux from 'agent-machines/mux';
import * as plane from 'agent-machines/control-plane';
import * as state from 'agent-machines/mux/state';
import { createE2bProvider } from 'agent-machines/mux/providers/e2b';
const require = createRequire(import.meta.url);
assert.equal(typeof sdk.AgentMachines, 'function');
assert.equal(typeof sdk.createMux, 'function');
assert.equal(typeof plane.AgentMachinesControlPlane, 'function');
assert.equal(typeof createE2bProvider, 'function');
assert.ok(Object.keys(state).length > 0);
assert.equal(sdk.createMux, mux.createMux);
assert.equal(sdk.AgentMachinesControlPlane, plane.AgentMachinesControlPlane);
for (const [name, esm] of [['agent-machines', sdk], ['agent-machines/mux', mux], ['agent-machines/control-plane', plane]]) {
  assert.deepEqual(Object.keys(require(name)).sort(), Object.keys(esm).sort());
}
assert.equal(require('agent-machines').createMux, sdk.createMux);
`], consumer);
	console.log(`verify-sdk-package: ${packed.filename} imports and requires correctly from an isolated consumer; all export targets ship.`);
} finally {
	rmSync(scratch, { recursive: true, force: true });
}
