import type { LogLine } from "@/lib/dashboard/types";
import {
	agentMetaForKind,
	fleetHue,
	fleetRegion,
	fleetTools,
	formatFleetUptime,
	formatRelativeTime,
	shortMachineId,
	type FleetToolBadge,
} from "@/lib/fleet/agent-styling";
import {
	PROVIDER_LABEL,
	type AgentKind,
	type MachineSpec,
	type ProviderKind,
} from "@/lib/user-config/schema";

export type FleetStreamCardModel = {
	id: string;
	href: string;
	name: string;
	agentKind: AgentKind;
	agentName: string;
	agentBy: string;
	logoMark: string;
	providerKind: ProviderKind;
	providerLabel: string;
	model: string;
	hue: string;
	shortId: string;
	region: string;
	uptime: string;
	cpu: string;
	mem: string;
	disk: string;
	tools: FleetToolBadge[];
	lines: string[];
	state: string;
	active: boolean;
	streamActive: boolean;
	lastActivityAt: string | null;
	lastActivityLabel: string | null;
	headline: string | null;
};

type MachineInput = {
	id: string;
	name: string;
	providerKind: ProviderKind;
	agentKind: AgentKind;
	spec: MachineSpec;
	model: string;
	createdAt: string;
	archived?: boolean;
	live:
		| { ok: true; state: string; rawPhase: string; lastError: string | null }
		| { ok: false; reason: string };
};

/**
 * Best-effort read of a stored machine spec, for every renderer of one.
 *
 * Returns only the axes that are actually numbers, mapping the legacy/foreign
 * `cpuCount` spelling (the e2b SDK's field name, found in real stored records
 * on 2026-08-03) onto `vcpu`. Renderers show "—" for what is absent. This is
 * the ONE place spec-shape tolerance lives; interpolating `spec.vcpu` raw in a
 * component is how "undefinedv · 2.0G · undefinedG" shipped.
 */
export function normalizeMachineSpec(
	spec: Partial<MachineSpec & { cpuCount: number }> | null | undefined,
): { vcpu?: number; memoryMib?: number; storageGib?: number } {
	const vcpu =
		typeof spec?.vcpu === "number"
			? spec.vcpu
			: typeof spec?.cpuCount === "number"
				? spec.cpuCount
				: undefined;
	return {
		...(vcpu !== undefined ? { vcpu } : {}),
		...(typeof spec?.memoryMib === "number" ? { memoryMib: spec.memoryMib } : {}),
		...(typeof spec?.storageGib === "number" ? { storageGib: spec.storageGib } : {}),
	};
}

/** "2.0 GiB", or an em-dash when the record has no numeric memoryMib. */
export function specMemoryGib(
	spec: Partial<MachineSpec & { cpuCount: number }> | null | undefined,
): string {
	const { memoryMib } = normalizeMachineSpec(spec);
	return memoryMib === undefined ? "— GiB" : `${(memoryMib / 1024).toFixed(1)} GiB`;
}

/** Compact "2v · 2.0G · 10G" line, with an em-dash for any missing axis. */
export function compactSpec(
	spec: Partial<MachineSpec & { cpuCount: number }> | null | undefined,
): string {
	const normal = normalizeMachineSpec(spec);
	const mem =
		normal.memoryMib === undefined ? "—" : (normal.memoryMib / 1024).toFixed(1);
	return `${normal.vcpu ?? "—"}v · ${mem}G · ${normal.storageGib ?? "—"}G`;
}

/**
 * Render a machine's size WITHOUT trusting the MachineSpec type.
 *
 * Stored records outlive the schema: on 2026-08-03 the fleet panel crashed on
 * two real config records whose spec was {cpuCount: 2, memoryMib: 2048} --
 * the e2b SDK's field name instead of vcpu, and no storageGib at all --
 * written by an external caller of the config store. `spec.storageGib
 * .toFixed(1)` threw and the ErrorBoundary took down the whole MachinesPanel,
 * so every machine disappeared because one record was malformed. A renderer
 * of persisted data gets Partial-of-unknown, shows an honest placeholder for
 * what is missing, and never decides the page.
 */
export function formatResourceRow(
	spec: Partial<MachineSpec & { cpuCount: number }> | null | undefined,
): { cpu: string; mem: string; disk: string } {
	const { vcpu, memoryMib, storageGib } = normalizeMachineSpec(spec);
	return {
		cpu: typeof vcpu === "number" ? `${vcpu} vCPU` : "— vCPU",
		mem:
			memoryMib === undefined
				? "— MB"
				: memoryMib >= 1024
					? `${(memoryMib / 1024).toFixed(1)} GB`
					: `${memoryMib} MB`,
		disk: storageGib === undefined ? "— GB" : `${storageGib.toFixed(1)} GB`,
	};
}

function isGatewayHeadline(message: string): boolean {
	return message.toLowerCase().includes("gateway healthy");
}

function activityLogMessages(logLines: LogLine[]): string[] {
	return logLines
		.filter((l) => !isGatewayHeadline(l.message))
		.slice(-16)
		.map((l) => l.message);
}

function idleTail(state: string, lastAt: string | null): string[] {
	if (state === "sleeping") return ["sleeping — state persisted to /home/machine"];
	if (state === "starting") return ["placement pending…", "bootstrap in progress…"];
	if (lastAt) return [`last activity ${formatRelativeTime(lastAt)}`];
	return ["waiting for prompt…"];
}

function emptyLogLines(state: string, archived?: boolean): string[] {
	if (archived) return ["archived — no live activity"];
	if (state === "sleeping") return ["sleeping — state persisted to /home/machine"];
	return ["no logs yet"];
}

function buildActivityLines(
	headline: string | null,
	logMsgs: string[],
): string[] {
	const taskLine = headline ? [`task: ${headline}`] : [];
	if (logMsgs.length === 0) return taskLine;
	if (!headline) return logMsgs;
	const headlineInLogs = logMsgs.some(
		(m) => m.toLowerCase().includes(headline.toLowerCase().slice(0, 24)),
	);
	return headlineInLogs ? logMsgs : [...taskLine, ...logMsgs];
}

export function buildTerminalLines(
	machine: MachineInput,
	logLines: LogLine[],
	headline: string | null,
): { lines: string[]; lastActivityAt: string | null; streamActive: boolean } {
	const state = machine.live.ok ? machine.live.state : "unknown";

	if (!machine.live.ok) {
		return {
			lines: ["probe unreachable — see status below"],
			lastActivityAt: null,
			streamActive: false,
		};
	}

	if (machine.archived) {
		const logMsgs = activityLogMessages(logLines);
		return {
			lines:
				logMsgs.length > 0
					? [...logMsgs.slice(-8), "archived — no live activity"]
					: emptyLogLines(state, true),
			lastActivityAt: logLines.length > 0 ? logLines[logLines.length - 1].at : null,
			streamActive: false,
		};
	}

	const logMsgs = activityLogMessages(logLines);
	const lastActivityAt =
		logLines.length > 0 ? logLines[logLines.length - 1].at : null;

	if (logMsgs.length === 0) {
		return {
			lines: emptyLogLines(state, machine.archived),
			lastActivityAt: null,
			streamActive: false,
		};
	}

	if (state === "starting") {
		return {
			lines: [
				"container starting…",
				"installing agent runtime…",
				...buildActivityLines(headline, logMsgs),
				...idleTail(state, lastActivityAt),
			],
			lastActivityAt,
			streamActive: true,
		};
	}

	if (state === "ready") {
		const lines =
			logMsgs.length > 0
				? buildActivityLines(headline, logMsgs)
				: buildActivityLines(headline, []).length > 0
					? buildActivityLines(headline, [])
					: idleTail(state, lastActivityAt);
		return {
			lines,
			lastActivityAt,
			streamActive: true,
		};
	}

	// sleeping — show last known activity, no live stream
	return {
		lines: [...buildActivityLines(headline, logMsgs), ...idleTail(state, lastActivityAt)],
		lastActivityAt,
		streamActive: false,
	};
}

export function toFleetStreamCard(
	machine: MachineInput,
	logLines: LogLine[],
	opts: { active: boolean; headline?: string | null; logsLoaded?: boolean },
): FleetStreamCardModel {
	const resources = formatResourceRow(machine.spec);
	const meta = agentMetaForKind(machine.agentKind);
	const { lines, lastActivityAt, streamActive } = buildTerminalLines(
		machine,
		logLines,
		opts.headline ?? null,
	);
	const state = machine.live.ok ? machine.live.state : "unknown";

	return {
		id: machine.id,
		href: `/dashboard/machines/${machine.id}`,
		name: machine.name,
		agentKind: machine.agentKind,
		agentName: meta.name,
		agentBy: meta.by,
		logoMark: meta.logoMark,
		providerKind: machine.providerKind,
		providerLabel: PROVIDER_LABEL[machine.providerKind],
		model: machine.model,
		hue: fleetHue(machine.agentKind),
		shortId: shortMachineId(machine.id),
		region: fleetRegion(machine.providerKind),
		uptime: formatFleetUptime(machine.createdAt),
		cpu: resources.cpu,
		mem: resources.mem,
		disk: resources.disk,
		tools: fleetTools(machine.agentKind),
		lines,
		state,
		active: opts.active,
		streamActive: streamActive && (opts.logsLoaded !== false),
		lastActivityAt,
		lastActivityLabel: lastActivityAt ? formatRelativeTime(lastActivityAt) : null,
		headline: opts.headline ?? null,
	};
}
