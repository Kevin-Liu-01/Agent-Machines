import { PageHeader } from "@/components/dashboard/PageHeader";
import { SkillsBrowser } from "@/components/dashboard/SkillsBrowser";
import { listSkills, skillCategories } from "@/lib/dashboard/skills";

export const dynamic = "force-dynamic";

export default function SkillsPage() {
	const skills = listSkills();
	const categories = skillCategories();

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker={`SKILLS -- ${skills.length} BUNDLED`}
				title="Skill library"
				description="Each entry is a SKILL.md the agent reads at session start. Cards link to the rendered markdown so you can see exactly what the agent is biased on. Edit `knowledge/skills/<slug>/SKILL.md` and run `npm run reload` to push without a re-deploy."
			/>
			<SkillsBrowser skills={skills} categories={categories} />
		</div>
	);
}
