/**
 * POST /api/dashboard/registry/add
 *
 * Two-phase mutation:
 *   1. Write to Clerk customLoadout (config always succeeds first)
 *   2. Execute install command on the user's machine
 *
 * If the install fails, the config entry stays (user can retry or
 * remove it). The response always includes the install log so the
 * UI can surface what happened.
 */

import { execOnMachine, isMachineRunning } from "@/lib/dashboard/exec";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import { toPublicConfig, type CustomLoadoutEntry } from "@/lib/user-config/schema";
import type { RegistryItem } from "@/lib/dashboard/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AddBody = {
	item: RegistryItem;
};

type AddResponse =
	| {
			ok: true;
			config: ReturnType<typeof toPublicConfig>;
			installLog: string;
			installOk: boolean;
	  }
	| { ok: false; error: string; phase: "auth" | "config" | "install" };

function toCustomEntry(item: RegistryItem): CustomLoadoutEntry {
	const now = new Date().toISOString();
	const kindMap: Record<string, CustomLoadoutEntry["kind"]> = {
		skill: "skill",
		mcp: "mcp",
		cli: "cli",
		tool: "tool",
		plugin: "plugin",
		provider: "tool",
		source: "tool",
	};
	return {
		id: item.id,
		name: item.name,
		kind: kindMap[item.kind] ?? "tool",
		description: item.description,
		command: item.installCommand,
		enabled: true,
		createdAt: now,
		updatedAt: now,
	};
}

function buildInstallCommand(item: RegistryItem): string | null {
	if (item.installCommand) return item.installCommand;
	if (item.kind === "source") return null;
	return null;
}

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json(
			{ ok: false, error: "unauthorized", phase: "auth" } satisfies AddResponse,
			{ status: 401 },
		);
	}

	let body: AddBody;
	try {
		body = (await request.json()) as AddBody;
	} catch {
		return Response.json(
			{ ok: false, error: "invalid JSON body", phase: "config" } satisfies AddResponse,
			{ status: 400 },
		);
	}

	const { item } = body;
	if (!item?.id || !item?.name) {
		return Response.json(
			{ ok: false, error: "missing item.id or item.name", phase: "config" } satisfies AddResponse,
			{ status: 400 },
		);
	}

	// Phase 1: Write to config
	const config = await getUserConfig();
	const alreadyExists = config.customLoadout.some((e) => e.id === item.id);
	if (!alreadyExists) {
		const entry = toCustomEntry(item);
		const next = await setUserConfig({
			customLoadout: [...config.customLoadout, entry],
		});

		// Phase 2: Install on machine
		const installCmd = buildInstallCommand(item);
		let installLog = "";
		let installOk = true;

		if (installCmd) {
			try {
				if (!(await isMachineRunning())) {
					return Response.json({
						ok: true,
						config: toPublicConfig(next),
						installLog: "Machine is offline. Item added to config; install will run on next wake.",
						installOk: false,
					} satisfies AddResponse);
				}

				const result = await execOnMachine(installCmd, { timeoutMs: 120_000 });
				installLog = [result.stdout, result.stderr].filter(Boolean).join("\n");
				installOk = result.exitCode === 0;
			} catch (err) {
				installLog = err instanceof Error ? err.message : "install exec failed";
				installOk = false;
			}
		} else {
			installLog = "No install command; config-only addition.";
		}

		return Response.json({
			ok: true,
			config: toPublicConfig(next),
			installLog,
			installOk,
		} satisfies AddResponse);
	}

	// Already installed -- just return current config
	return Response.json({
		ok: true,
		config: toPublicConfig(config),
		installLog: "Already in loadout.",
		installOk: true,
	} satisfies AddResponse);
}
