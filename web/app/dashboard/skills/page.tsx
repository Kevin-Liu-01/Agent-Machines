import { PageHeader } from "@/components/dashboard/PageHeader";
import { SkillsBrowser } from "@/components/dashboard/SkillsBrowser";
import { importedSkills } from "@/lib/dashboard/pool";
import { listSkills } from "@/lib/dashboard/skills";
import type { SkillSummary } from "@/lib/dashboard/types";
import { getUserConfig } from "@/lib/user-config/clerk";
import type { CustomLoadoutEntry } from "@/lib/user-config/schema";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
	const config = await getUserConfig();

	// The pool: the curated default starter set + anything imported from the
	// Registry. Split into catalog-backed skills (have detail pages) and custom
	// / external ones (rendered from their own entry metadata).
	const catalogSlugs = new Set(listSkills().map((s) => s.slug));
	const bundled: SkillSummary[] = importedSkills(config).filter((s) => catalogSlugs.has(s.slug));
	const custom: CustomLoadoutEntry[] = config.customLoadout.filter(
		(entry) => entry.kind === "skill" && entry.enabled && !entry.id.startsWith("skill-"),
	);
	const categories = [...new Set(bundled.map((s) => s.category))].sort();
	const total = bundled.length + custom.length;

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker={`SKILLS -- ${total} IN LIBRARY`}
				title="Skill library"
				description="The skills loaded on your machines: a curated starter set from the bundled library, plus anything you add. The full library and external sources live in the Registry; a Memory selects which of these an agent uses."
			/>
			<SkillsBrowser skills={bundled} categories={categories} customSkills={custom} />
		</div>
	);
}
