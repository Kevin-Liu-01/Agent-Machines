import type { LogLine } from "@/lib/dashboard/types";
import type { Mark } from "@/components/Logo";
import { AGENT_HUE } from "@/lib/fleet/agent-styling";
import type { AgentKind, ProviderKind } from "@/lib/user-config/schema";

import {
	dateKey,
	startOfDay,
} from "./grid";
import { finalizeActivityPayload } from "./finalize-payload";
import { SERVICE_PATTERNS, detectServices } from "./service-patterns";
import type {
	ActivityDay,
	ActivityEvent,
	ActivityPayload,
	AgentFilterChip,
	ServiceFilterChip,
} from "./types";

type MachineRow = {
	id: string;
	name: string;
	agentKind: AgentKind;
	providerKind: ProviderKind;
	createdAt: string;
};

type TransitionRow = {
	machine_id: string;
	machine_name: string | null;
	to_phase: string;
	occurred_at: string;
	label?: string | null;
};

const AGENT_CHIP: Record<AgentKind, { id: string; label: string; mark: Mark }> = {
	hermes: { id: "nous", label: "Nous", mark: "nous" },
	openclaw: { id: "openclaw", label: "OpenClaw", mark: "openclaw" },
	"claude-code": { id: "claude-code", label: "Claude Code", mark: "anthropic" },
	codex: { id: "codex", label: "Codex CLI", mark: "openai" },
};

const PROVIDER_CHIP: Record<ProviderKind, { id: string; label: string; mark: Mark }> = {
	dedalus: { id: "dedalus", label: "Dedalus", mark: "dedalus" },
	e2b: { id: "e2b", label: "E2B", mark: "e2b" },
	sprites: { id: "sprites", label: "Sprites", mark: "sprites" },
	vercel: { id: "vercel", label: "Vercel", mark: "vercel" },
};

function ensureDay(map: Map<string, ActivityDay>, date: string): ActivityDay {
	let day = map.get(date);
	if (!day) {
		day = {
			date,
			level: 0,
			hue: "var(--ret-border)",
			agentKinds: [],
			providers: [],
			services: [],
			events: [],
		};
		map.set(date, day);
	}
	return day;
}

function bumpDay(
	day: ActivityDay,
	agentKind: AgentKind,
	providerKind: ProviderKind,
	services: string[],
): void {
	day.level = Math.min(4, day.level + 1);
	if (!day.agentKinds.includes(agentKind)) day.agentKinds.push(agentKind);
	if (!day.providers.includes(providerKind)) day.providers.push(providerKind);
	for (const s of services) {
		if (!day.services.includes(s)) day.services.push(s);
	}
	day.hue = AGENT_HUE[agentKind] ?? day.hue;
}

export function buildLiveActivityPayload(input: {
	machines: MachineRow[];
	transitions: TransitionRow[];
	logsByMachine: Record<string, LogLine[]>;
	usageDays?: Array<{ date: string; vcpuSeconds: number }>;
}): ActivityPayload {
	const dayMap = new Map<string, ActivityDay>();
	const agentCounts = new Map<string, number>();
	const serviceCounts = new Map<string, number>();

	const machineById = new Map(input.machines.map((m) => [m.id, m]));

	for (const row of input.transitions) {
		const machine = machineById.get(row.machine_id);
		if (!machine) continue;
		const key = dateKey(startOfDay(new Date(row.occurred_at)));
		const day = ensureDay(dayMap, key);
		bumpDay(day, machine.agentKind, machine.providerKind, []);
		const title =
			row.label ??
			`${row.machine_name ?? row.machine_id} → ${row.to_phase}`;
		day.events.push({
			id: `${row.occurred_at}-${row.machine_id}`,
			at: row.occurred_at,
			kind: row.to_phase === "running" ? "deploy" : "agent",
			title,
			subtitle: machine.name,
			agentKind: machine.agentKind,
			hue: AGENT_HUE[machine.agentKind],
		});
		agentCounts.set(machine.agentKind, (agentCounts.get(machine.agentKind) ?? 0) + 1);
		agentCounts.set(
			machine.providerKind,
			(agentCounts.get(machine.providerKind) ?? 0) + 1,
		);
	}

	for (const [machineId, lines] of Object.entries(input.logsByMachine)) {
		const machine = machineById.get(machineId);
		if (!machine) continue;
		for (const line of lines) {
			if (!line.at) continue;
			const key = dateKey(startOfDay(new Date(line.at)));
			const services = detectServices(line.message);
			const day = ensureDay(dayMap, key);
			bumpDay(day, machine.agentKind, machine.providerKind, services);
			day.events.push({
				id: `${line.at}-${machineId}-${day.events.length}`,
				at: line.at,
				kind: "agent",
				title: line.message.slice(0, 56),
				subtitle: machine.name,
				agentKind: machine.agentKind,
				service: services[0],
				hue: AGENT_HUE[machine.agentKind],
			});
			agentCounts.set(machine.agentKind, (agentCounts.get(machine.agentKind) ?? 0) + 1);
			if (line.message.includes("cursor_agent")) {
				agentCounts.set("cursor", (agentCounts.get("cursor") ?? 0) + 1);
				serviceCounts.set("cursor", (serviceCounts.get("cursor") ?? 0) + 1);
			}
			for (const s of services) {
				serviceCounts.set(s, (serviceCounts.get(s) ?? 0) + 1);
			}
		}
	}

	for (const bucket of input.usageDays ?? []) {
		if (bucket.vcpuSeconds <= 0) continue;
		const key = bucket.date;
		const day = ensureDay(dayMap, key);
		if (day.level === 0) day.level = 1;
	}

	if (dayMap.size === 0) {
		return finalizeActivityPayload(dayMap, [], []);
	}

	const agentFilters: AgentFilterChip[] = [];
	for (const [kind, meta] of Object.entries(AGENT_CHIP) as [
		AgentKind,
		(typeof AGENT_CHIP)[AgentKind],
	][]) {
		const count = agentCounts.get(kind) ?? 0;
		if (count > 0) {
			agentFilters.push({
				id: meta.id,
				label: meta.label.toUpperCase(),
				mark: meta.mark,
				count,
			});
		}
	}
	const cursorCount = agentCounts.get("cursor") ?? 0;
	if (cursorCount > 0) {
		agentFilters.push({
			id: "cursor",
			label: "Cursor",
			mark: "cursor",
			count: cursorCount,
		});
	}
	for (const [kind, meta] of Object.entries(PROVIDER_CHIP) as [
		ProviderKind,
		(typeof PROVIDER_CHIP)[ProviderKind],
	][]) {
		const count = agentCounts.get(kind) ?? 0;
		if (count > 0) {
			agentFilters.push({
				id: meta.id,
				label: meta.label.toUpperCase(),
				mark: meta.mark,
				count,
			});
		}
	}
	agentFilters.sort((a, b) => b.count - a.count);

	const serviceFilters: ServiceFilterChip[] = SERVICE_PATTERNS.map((entry) => ({
		slug: entry.slug,
		label: entry.label,
		count: serviceCounts.get(entry.slug) ?? 0,
	}))
		.filter((s) => s.count > 0)
		.sort((a, b) => b.count - a.count);

	return finalizeActivityPayload(dayMap, agentFilters, serviceFilters);
}
