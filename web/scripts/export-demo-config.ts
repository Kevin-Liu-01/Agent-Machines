/**
 * One-shot exporter: serializes current demo TS fixtures into demo-config.json.
 * Run: cd web && npx tsx scripts/export-demo-config.ts
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEMO_CRON_RUNS, DEMO_GATEWAY, DEMO_METRICS_SUMMARY, DEMO_USAGE } from "../lib/demo/fixtures";
import { listCronDetailNames, getCronRunDetail } from "../lib/demo/cron-details";
import { STARTER_PROMPTS_BY_MACHINE } from "../lib/demo/machine-narratives";
import { allDemoMachines, getDemoActiveMachineId } from "../lib/demo/state";
import { getMachineNarrative } from "../lib/demo/machine-narratives";
import { loadDemoChat } from "../lib/demo/chat-records";

const __dir = dirname(fileURLToPath(import.meta.url));

const machines: Record<string, unknown> = {};
for (const m of allDemoMachines()) {
	const narrative = getMachineNarrative(m.id);
	const chats = narrative.chats.map((summary) => ({
		...summary,
		messages: loadDemoChat(summary.id)?.messages ?? [],
	}));
	machines[m.id] = {
		headline: narrative.headline,
		starterPrompts: STARTER_PROMPTS_BY_MACHINE[m.id] ?? [],
		chats,
		sessions: narrative.sessions,
		logs: narrative.logs,
		cursor: narrative.cursor,
		artifacts: narrative.artifacts,
		exec: {
			defaultStdout: narrative.execStdout,
		},
		usage: {
			scale: narrative.usage.resources.cpu.buckets.length
				? narrative.usage.resources.cpu.buckets.reduce((n, b) => n + b.vcpuSeconds, 0) /
					(3600 * 7 * 1.2)
				: 1,
			transitions: narrative.usage.transitions,
			bucketDays: 7,
		},
		machineSummary: {
			phase: "running",
			desired: "running",
			vcpu: m.spec.vcpu,
			memoryMib: m.spec.memoryMib,
			storageGib: m.spec.storageGib,
		},
	};
}

const cronDetails: Record<string, unknown> = {};
for (const name of listCronDetailNames()) {
	const detail = getCronRunDetail(name);
	if (detail) cronDetails[name] = detail;
}

const fleetMachines = allDemoMachines().map((m) => ({
	id: m.id,
	name: m.name,
	providerKind: m.providerKind,
	agentKind: m.agentKind,
	model: m.model,
	spec: m.spec,
	createdAtDaysAgo: m.id === "demo-fullstack" ? 13 : m.id === "demo-code-review" ? 9 : m.id === "demo-research" ? 6 : 3,
	live: { state: "ready", rawPhase: "running" },
}));

const out = {
	version: 1,
	fleet: {
		activeMachineId: getDemoActiveMachineId() ?? "demo-fullstack",
		gateway: DEMO_GATEWAY,
		metricsSummary: DEMO_METRICS_SUMMARY,
		usage: DEMO_USAGE,
		cronRuns: DEMO_CRON_RUNS,
		cronDetails,
		machines: fleetMachines,
		providers: {
			dedalus: { apiKey: "demo-dedalus-key" },
			e2b: { apiKey: "demo-e2b-key" },
			sprites: { apiKey: "demo-sprites-key" },
		},
	},
	machines,
};

const target = join(__dir, "../lib/demo/demo-config.json");
writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`, "utf8");
console.log(`Wrote ${target}`);
