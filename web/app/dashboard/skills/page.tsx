import { PageHeader } from "@/components/dashboard/PageHeader";
import { SkillsBrowser } from "@/components/dashboard/SkillsBrowser";
import { listSkills } from "@/lib/dashboard/skills";
import type { SkillSummary } from "@/lib/dashboard/types";
import { getUserConfig } from "@/lib/user-config/clerk";
import type { CustomLoadoutEntry } from "@/lib/user-config/schema";

export const dynamic = "force-dynamic";

const SKILL_PREFIX = "skill-";

export default async function SkillsPage() {
	const config = await getUserConfig();
	const catalog = new Map(listSkills().map((s) => [s.slug, s]));

	// Imported-only: split the customLoadout skill entries into bundled skills
	// (joined back to their catalog metadata for the detail link) and custom /
	// external ones (rendered from their own entry metadata).
	const bundled: SkillSummary[] = [];
	const custom: CustomLoadoutEntry[] = [];
	for (const entry of config.customLoadout) {
		if (entry.kind !== "skill" || !entry.enabled) continue;
		if (entry.id.startsWith(SKILL_PREFIX)) {
			const skill = catalog.get(entry.id.slice(SKILL_PREFIX.length));
			if (skill) {
				bundled.push(skill);
				continue;
			}
		}
		custom.push(entry);
	}
	const categories = [...new Set(bundled.map((s) => s.category))].sort();
	const total = bundled.length + custom.length;

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker={`SKILLS -- ${total} IMPORTED`}
				title="Skill library"
				description="Skills you've imported from the Registry, installed to ~/.agent-machines/skills/ on your machines. Browse the full catalog and install more in Registry, or add your own by pasting a SKILL.md or importing a URL."
			/>
			<SkillsBrowser skills={bundled} categories={categories} customSkills={custom} />
		</div>
	);
}
