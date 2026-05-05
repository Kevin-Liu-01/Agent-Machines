import "dotenv/config";
import Dedalus from "dedalus";

const machineId = process.argv[2];
if (!machineId) {
	console.error("usage: tsx scripts/debug-vm.ts <machine-id>");
	process.exit(1);
}

const client = new Dedalus({
	xAPIKey: process.env.DEDALUS_API_KEY,
	baseURL: process.env.DEDALUS_BASE_URL ?? "https://dcs.dedaluslabs.ai",
});

async function exec(cmd: string, timeout = 60_000) {
	const e = await client.machines.executions.create({
		machine_id: machineId,
		command: ["/bin/bash", "-c", cmd],
		timeout_ms: timeout,
	});
	let r = e;
	while (r.status !== "succeeded" && r.status !== "failed") {
		await new Promise((res) => setTimeout(res, 1000));
		r = await client.machines.executions.retrieve({
			machine_id: machineId,
			execution_id: e.execution_id,
		});
	}
	const o = await client.machines.executions.output({
		machine_id: machineId,
		execution_id: e.execution_id,
	});
	console.log(`--- ${cmd}`);
	if (o.stdout?.trim()) console.log(o.stdout.trim());
	if (o.stderr?.trim()) console.log(`stderr: ${o.stderr.trim()}`);
	console.log(`exit ${r.exit_code} (${r.status})\n`);
}

const ENV =
	"export HOME=/home/machine && export VIRTUAL_ENV=/home/machine/.venv && " +
	"export PATH=/home/machine/.local/bin:/home/machine/.venv/bin:$PATH";

async function main() {
	await exec(`${ENV} && hermes dashboard --help 2>&1 | head -20`);
	await exec(`tail -30 /home/machine/.hermes/logs/dashboard.log 2>&1 || echo "no log"`);
	await exec(
		`${ENV} && /home/machine/start-dashboard.sh & sleep 8 && ss -tlnp | grep 9119 || echo "still not bound"`,
		60_000,
	);
	await exec(`tail -30 /home/machine/.hermes/logs/dashboard.log 2>&1`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
