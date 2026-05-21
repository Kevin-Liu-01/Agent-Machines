import { PageHeader } from "@/components/dashboard/PageHeader";
import { SkillsBrowser } from "@/components/dashboard/SkillsBrowser";
import { listSkills, skillCategories } from "@/lib/dashboard/skills";
import { getUserConfig } from "@/lib/user-config/clerk";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
	const skills = listSkills();
	const categories = skillCategories();
	const config = await getUserConfig();
	const customSkills = config.customLoadout.filter((entry) => entry.kind === "skill");

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker={`SKILLS -- ${skills.length} BUNDLED${customSkills.length ? ` + ${customSkills.length} YOURS` : ""}`}
				title="Skill library"
				description="Bundled skills sync from knowledge/skills/ via reload. Add your own by pasting SKILL.md, importing a GitHub or raw URL, or absorbing any doc link — they install to ~/.agent-machines/skills/custom/ on your machine."
			/>
			<SkillsBrowser skills={skills} categories={categories} customSkills={customSkills} />
		</div>
	);
}
