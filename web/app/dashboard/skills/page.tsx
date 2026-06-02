import { PageHeader } from "@/components/dashboard/PageHeader";
import { SkillsBrowser } from "@/components/dashboard/SkillsBrowser";
import { listSkills } from "@/lib/dashboard/skills";
import type { SkillSummary } from "@/lib/dashboard/types";
import { getUserConfig } from "@/lib/user-config/clerk";
import type { CustomLoadoutEntry } from "@/lib/user-config/schema";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
	const config = await getUserConfig();

	// The pool: the full bundled library (default-loaded on every machine) plus
	// any custom / external skills the user added from the Registry (entries
	// that aren't a bundled `skill-<slug>`).
	const bundled: SkillSummary[] = listSkills();
	const custom: CustomLoadoutEntry[] = config.customLoadout.filter(
		(entry) => entry.kind === "skill" && entry.enabled && !entry.id.startsWith("skill-"),
	);
	const categories = [...new Set(bundled.map((s) => s.category))].sort();
	const total = bundled.length + custom.length;

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker={`SKILLS -- ${total} AVAILABLE`}
				title="Skill library"
				description="The skills loaded on your machines: the bundled library shipped by default, plus any you add from the Registry or paste yourself. A Memory selects which of these an agent uses."
			/>
			<SkillsBrowser skills={bundled} categories={categories} customSkills={custom} />
		</div>
	);
}
