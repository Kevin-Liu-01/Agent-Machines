/**
 * POST /api/dashboard/skills/add
 *
 * Add a user skill to the machine and account loadout.
 *
 * Modes:
 *   paste  — full SKILL.md or markdown body
 *   url    — GitHub repo, raw SKILL.md, or skills-style URL
 *   absorb — any HTTP(S) page; text is fetched and wrapped as a skill
 */

import { execOnMachine, isMachineRunning } from "@/lib/dashboard/exec";
import {
	buildInstallSkillShell,
	customSkillId,
	customSkillPath,
	resolveSkillInput,
	type SkillInputMode,
} from "@/lib/dashboard/skills/custom-skill";
import { getUserConfig, setUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import { toPublicConfig, type CustomLoadoutEntry, type LoadoutSource } from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AddSkillBody = {
	mode: SkillInputMode;
	slug?: string;
	name?: string;
	description?: string;
	content?: string;
	url?: string;
	machineId?: string;
};

type AddSkillResponse =
	| {
			ok: true;
			skill: {
				slug: string;
				name: string;
				description: string;
				path: string;
				sourceUrl: string | null;
			};
			config: ReturnType<typeof toPublicConfig>;
			installLog: string;
			installOk: boolean;
	  }
	| { ok: false; error: string; phase: "auth" | "resolve" | "config" | "install" };

function upsertCustomSkill(
	entries: CustomLoadoutEntry[],
	resolved: { slug: string; name: string; description: string; sourceUrl: string | null },
): CustomLoadoutEntry[] {
	const id = customSkillId(resolved.slug);
	const now = new Date().toISOString();
	const next: CustomLoadoutEntry = {
		id,
		name: resolved.name,
		kind: "skill",
		description: resolved.description,
		command: customSkillPath(resolved.slug),
		enabled: true,
		createdAt: now,
		updatedAt: now,
	};
	const without = entries.filter((e) => e.id !== id);
	return [...without, next];
}

function upsertUrlSource(sources: LoadoutSource[], url: string, name: string): LoadoutSource[] {
	const slug = url.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48);
	const id = `source:url:${slug}`;
	if (sources.some((s) => s.id === id)) return sources;
	const now = new Date().toISOString();
	return [
		...sources,
		{
			id,
			name,
			kind: "url",
			description: `User-imported skill source`,
			uri: url,
			enabled: true,
			createdAt: now,
			updatedAt: now,
		},
	];
}

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json(
			{ ok: false, error: "unauthorized", phase: "auth" } satisfies AddSkillResponse,
			{ status: 401 },
		);
	}

	let body: AddSkillBody;
	try {
		body = (await request.json()) as AddSkillBody;
	} catch {
		return Response.json(
			{ ok: false, error: "invalid JSON body", phase: "resolve" } satisfies AddSkillResponse,
			{ status: 400 },
		);
	}

	if (!body.mode || !["paste", "url", "absorb"].includes(body.mode)) {
		return Response.json(
			{ ok: false, error: "mode must be paste, url, or absorb", phase: "resolve" } satisfies AddSkillResponse,
			{ status: 400 },
		);
	}

	let resolved;
	try {
		resolved = await resolveSkillInput(body);
	} catch (err) {
		return Response.json(
			{
				ok: false,
				error: err instanceof Error ? err.message : "could not resolve skill",
				phase: "resolve",
			} satisfies AddSkillResponse,
			{ status: 400 },
		);
	}

	const config = await getUserConfig();
	const customLoadout = upsertCustomSkill(config.customLoadout, resolved);
	const loadoutSources =
		resolved.sourceUrl != null
			? upsertUrlSource(config.loadoutSources, resolved.sourceUrl, resolved.name)
			: config.loadoutSources;

	const nextConfig = await setUserConfig({ customLoadout, loadoutSources });

	const installShell = buildInstallSkillShell(resolved.slug, resolved.content);
	let installLog = "";
	let installOk = true;

	try {
		if (!(await isMachineRunning(body.machineId))) {
			return Response.json({
				ok: true,
				skill: {
					slug: resolved.slug,
					name: resolved.name,
					description: resolved.description,
					path: customSkillPath(resolved.slug),
					sourceUrl: resolved.sourceUrl,
				},
				config: toPublicConfig(nextConfig),
				installLog: "Saved to account. Machine is offline — skill will install on next wake (re-open this page or ask the agent to sync).",
				installOk: false,
			} satisfies AddSkillResponse);
		}

		const result = await execOnMachine(installShell, {
			machineId: body.machineId,
			timeoutMs: 60_000,
		});
		installLog = [result.stdout, result.stderr].filter(Boolean).join("\n");
		installOk = result.exitCode === 0;
	} catch (err) {
		installLog = err instanceof Error ? err.message : "install exec failed";
		installOk = false;
	}

	return Response.json({
		ok: true,
		skill: {
			slug: resolved.slug,
			name: resolved.name,
			description: resolved.description,
			path: customSkillPath(resolved.slug),
			sourceUrl: resolved.sourceUrl,
		},
		config: toPublicConfig(nextConfig),
		installLog,
		installOk,
	} satisfies AddSkillResponse);
}
