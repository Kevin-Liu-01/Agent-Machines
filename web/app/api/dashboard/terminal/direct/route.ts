import { randomBytes, randomInt } from "node:crypto";

import {
	buildDirectTerminalRelayCommand,
	buildDirectTerminalRelayServiceLaunch,
	DIRECT_TERMINAL_MIN_PORT,
	DIRECT_TERMINAL_PORT_SPAN,
	DIRECT_TERMINAL_ACK_PROTOCOL,
	DIRECT_TERMINAL_PROTOCOL,
} from "@/lib/dashboard/direct-terminal-relay";
import { resolveMachine } from "@/lib/dashboard/exec";
import { getProvider } from "@/lib/providers";
import { getUserConfigById } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const preferredRegion = "sfo1";

function clampDimension(
	value: unknown,
	min: number,
	max: number,
	fallback: number,
): number {
	const number = Math.floor(Number(value));
	if (!Number.isFinite(number)) return fallback;
	return Math.min(max, Math.max(min, number));
}

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	const requestUrl = new URL(request.url);
	const requestOrigin = request.headers.get("origin") ?? requestUrl.origin;
	let origin: URL;
	try {
		origin = new URL(requestOrigin);
	} catch {
		return Response.json({ error: "invalid_origin" }, { status: 403 });
	}
	if (origin.protocol !== "https:" || origin.host !== requestUrl.host) {
		return Response.json({ error: "invalid_origin" }, { status: 403 });
	}

	const body = (await request.json().catch(() => null)) as {
		machineId?: unknown;
		cols?: unknown;
		rows?: unknown;
	} | null;
	const machineId = typeof body?.machineId === "string" ? body.machineId : null;
	const cols = clampDimension(body?.cols, 20, 500, 120);
	const rows = clampDimension(body?.rows, 5, 200, 32);
	const config = await getUserConfigById(userId);
	const machine = resolveMachine(config, machineId);
	if (!machine) {
		return Response.json({ error: "machine_not_found" }, { status: 404 });
	}
	// E2B exposes arbitrary custom ports; Sprites exposes its fixed public
	// service port. Other providers retain the pinned native-PTY function.
	if (machine.providerKind !== "e2b" && machine.providerKind !== "sprites") {
		return Response.json({ error: "direct_pty_not_supported" }, { status: 501 });
	}

	const provider = getProvider(machine.providerKind, config.providers);
	if (!provider.execBackground || !provider.getPublicUrl) {
		return Response.json({ error: "direct_pty_not_supported" }, { status: 501 });
	}

	const port =
		machine.providerKind === "sprites"
			? 8080
			: DIRECT_TERMINAL_MIN_PORT + randomInt(DIRECT_TERMINAL_PORT_SPAN);
	const token = `amt_${randomBytes(32).toString("base64url")}`;
	const launch = {
		port,
		token,
		origin: origin.origin,
		cols,
		rows,
	};
	if (machine.providerKind === "sprites") {
		const service = buildDirectTerminalRelayServiceLaunch(launch);
		const staged = await provider.exec(machine.id, service.setupCommand, {
			timeoutMs: 20_000,
		});
		if (staged.exitCode !== 0 || !provider.replacePublicService) {
			return Response.json({ error: "direct_pty_unavailable" }, { status: 503 });
		}
		await provider.replacePublicService(machine.id, {
			name: service.serviceName,
			command: service.command,
			args: service.args,
			httpPort: port,
		});
	} else {
		await provider.execBackground(
			machine.id,
			buildDirectTerminalRelayCommand(launch),
		);
	}
	const publicUrl = await provider.getPublicUrl(machine.id, port);
	if (!publicUrl) {
		return Response.json({ error: "direct_pty_unavailable" }, { status: 503 });
	}
	const socketUrl = new URL("/terminal", publicUrl);
	socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";

	return Response.json(
		{
			ok: true,
			url: socketUrl.toString(),
			token,
			protocol: DIRECT_TERMINAL_PROTOCOL,
			ackProtocol: DIRECT_TERMINAL_ACK_PROTOCOL,
		},
		{ headers: { "Cache-Control": "private, no-store" } },
	);
}
