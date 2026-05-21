import type { Mark } from "@/components/Logo";
import { getMachineNarrative } from "@/lib/demo/config";
import { allDemoMachines } from "@/lib/demo/state";
import { AGENT_HUE } from "@/lib/fleet/agent-styling";
import { agentLogoMark } from "@/lib/fleet/logos";
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
	ActivityEventKind,
	ActivityPayload,
	AgentFilterChip,
	ServiceFilterChip,
} from "./types";

type DayBucket = ActivityDay;

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
};

function ensureDay(map: Map<string, DayBucket>, date: string): DayBucket {
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
	day: DayBucket,
	agentKind: AgentKind,
	providerKind: ProviderKind,
	services: string[],
	amount = 1,
): void {
	day.level = Math.min(4, day.level + amount);
	if (!day.agentKinds.includes(agentKind)) day.agentKinds.push(agentKind);
	if (!day.providers.includes(providerKind)) day.providers.push(providerKind);
	for (const s of services) {
		if (!day.services.includes(s)) day.services.push(s);
	}
	day.hue = AGENT_HUE[agentKind] ?? day.hue;
}

function addEvent(
	day: DayBucket,
	event: Omit<ActivityEvent, "id" | "hue"> & { hue?: string },
): void {
	day.events.push({
		...event,
		id: `${event.at}-${event.kind}-${day.events.length}`,
		hue: event.hue ?? AGENT_HUE[event.agentKind ?? "hermes"] ?? "var(--ret-purple)",
	});
}

function seededNoise(seed: string, n: number): number {
	let h = 0;
	for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
	return Math.abs((h + n * 9973) % 1000) / 1000;
}

function inferEventKind(message: string): ActivityEventKind {
	const m = message.toLowerCase();
	if (m.includes("cron") || m.includes("health-check")) return "health";
	if (m.includes("deepsec") || m.includes("security") || m.includes("audit")) {
		return "audit";
	}
	if (m.includes("pr #") || m.includes("review")) return "review";
	if (m.includes("wiki") || m.includes("bookmark") || m.includes("memory")) {
		return "research";
	}
	if (m.includes("tunnel") || m.includes("deploy") || m.includes("gateway")) {
		return "deploy";
	}
	return "agent";
}

function titleFromLog(message: string): { title: string; subtitle: string } {
	const parts = message.split(" — ");
	if (parts.length >= 2) {
		return { title: parts[0].trim(), subtitle: parts.slice(1).join(" — ").trim() };
	}
	if (message.length > 48) {
		return { title: message.slice(0, 48), subtitle: message.slice(48).trim() };
	}
	return { title: message, subtitle: "" };
}

export function buildDemoActivityPayload(): ActivityPayload {
	const end = startOfDay(new Date());
	const dayMap = new Map<string, DayBucket>();
	const agentCounts = new Map<string, number>();
	const serviceCounts = new Map<string, number>();

	const machines = allDemoMachines();
	let seedStart = end;
	for (const machine of machines) {
		const created = startOfDay(new Date(machine.createdAt));
		if (created < seedStart) seedStart = created;
	}

	for (const machine of machines) {
		const narrative = getMachineNarrative(machine.id);
		const agentKind = machine.agentKind;
		const providerKind = machine.providerKind;

		const created = new Date(machine.createdAt);
		const createdKey = dateKey(startOfDay(created));

		for (const line of narrative.logs.lines) {
			if (!line.at) continue;
			const key = dateKey(startOfDay(new Date(line.at)));
			const day = ensureDay(dayMap, key);
			const services = detectServices(line.message);
			bumpDay(day, agentKind, providerKind, services, 1);
			const { title, subtitle } = titleFromLog(line.message);
			addEvent(day, {
				at: line.at,
				kind: inferEventKind(line.message),
				title,
				subtitle: subtitle || machine.name,
				agentKind,
				service: services[0],
			});
			agentCounts.set(agentKind, (agentCounts.get(agentKind) ?? 0) + 1);
			if (line.message.includes("cursor_agent")) {
				agentCounts.set("cursor", (agentCounts.get("cursor") ?? 0) + 1);
				serviceCounts.set("cursor", (serviceCounts.get("cursor") ?? 0) + 1);
			}
			agentCounts.set(providerKind, (agentCounts.get(providerKind) ?? 0) + 1);
			for (const s of services) {
				serviceCounts.set(s, (serviceCounts.get(s) ?? 0) + 1);
			}
		}

		for (const t of narrative.usage.transitions) {
			const key = dateKey(startOfDay(new Date(t.timestamp)));
			const day = ensureDay(dayMap, key);
			bumpDay(day, agentKind, providerKind, [], 1);
			addEvent(day, {
				at: t.timestamp,
				kind: t.label.toLowerCase().includes("provision") ? "deploy" : "agent",
				title: t.label,
				subtitle: machine.name,
				agentKind,
			});
		}

		let cursor = new Date(seedStart);
		while (cursor <= end) {
			const key = dateKey(cursor);
			if (key < createdKey) {
				cursor.setDate(cursor.getDate() + 1);
				continue;
			}
			const noise = seededNoise(machine.id, cursor.getTime());
			if (noise > 0.42) {
				const day = ensureDay(dayMap, key);
				bumpDay(day, agentKind, providerKind, [], noise > 0.78 ? 2 : 1);
				agentCounts.set(agentKind, (agentCounts.get(agentKind) ?? 0) + 1);
				agentCounts.set(providerKind, (agentCounts.get(providerKind) ?? 0) + 1);
			}
			cursor.setDate(cursor.getDate() + 1);
		}
	}

	for (const day of dayMap.values()) {
		if (day.events.length === 0 && day.level > 0) {
			const agent = day.agentKinds[0] ?? "hermes";
			addEvent(day, {
				at: `${day.date}T12:00:00.000Z`,
				kind: "agent",
				title: "machine awake",
				subtitle: "background activity",
				agentKind: agent,
			});
		}
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

	if (serviceCounts.get("cursor")) {
		serviceFilters.unshift({
			slug: "cursor",
			label: "Cursor",
			count: serviceCounts.get("cursor") ?? 0,
		});
	}

	return finalizeActivityPayload(dayMap, agentFilters, serviceFilters);
}

export function agentChipMeta(agentKind: AgentKind) {
	return {
		mark: agentLogoMark(agentKind),
		hue: AGENT_HUE[agentKind],
	};
}
