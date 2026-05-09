/**
 * GET /api/dashboard/skills
 *
 * Returns the bundled skill library as a list (no body content). Auth-gated.
 * The body of each skill is served by `/dashboard/skills/[slug]` page,
 * which reads the same JSON artifact server-side and renders markdown --
 * no per-skill API endpoint needed.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import { listSkills, skillCategories } from "@/lib/dashboard/skills";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	return Response.json({
		skills: listSkills(),
		categories: skillCategories(),
	});
}
