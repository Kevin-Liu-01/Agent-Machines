/**
 * GET /api/dashboard/skills
 *
 * Returns the user's imported skills (the account-global pool), not the full
 * bundled catalog -- the catalog is browsable in the Registry. Auth-gated.
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import { importedSkills } from "@/lib/dashboard/pool";
import { getUserConfig } from "@/lib/user-config/clerk";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	const config = await getUserConfig();
	const skills = importedSkills(config);
	const categories = [...new Set(skills.map((s) => s.category))].sort();
	return Response.json({ skills, categories });
}
