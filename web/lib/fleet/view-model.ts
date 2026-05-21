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

export function formatResourceRow(spec: MachineSpec): { cpu: string; mem: string; disk: string } {
	return {
		cpu: `${spec.vcpu} vCPU`,
		mem: spec.memoryMib >= 1024 ? `${(spec.memoryMib / 1024).toFixed(1)} GB` : `${spec.memoryMib} MB`,
		disk: `${spec.storageGib.toFixed(1)} GB`,
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
