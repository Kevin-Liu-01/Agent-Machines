import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ArrowUpRight, Layers } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { RegistryBrowser } from "@/components/dashboard/RegistryBrowser";
import { getUserConfigForRequest } from "@/lib/user-config/clerk";
import type { TrustedAddOnKind } from "@/lib/dashboard/loadout";
import { WorkspaceTabs, TOOLKIT_TABS } from "@/components/dashboard/WorkspaceTabs";
import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { SkillsBrowser } from "@/components/dashboard/SkillsBrowser";
import { McpLibrary } from "@/components/dashboard/McpLibrary";
import { importedSkills, importedMcps } from "@/lib/dashboard/pool";
import { listSkills } from "@/lib/dashboard/skills";
import { SearchOutline, Package as Bookmark, Plug2, ArrowRight } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

export default async function RegistryPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; tab?: string }> }) {
	const params = await searchParams;
	const initialQuery = typeof params.q === "string" ? params.q.slice(0, 300) : "";
	const supportedKinds: readonly string[] = ["skill", "mcp", "cli", "tool", "plugin", "provider", "source"];
	const initialKind: TrustedAddOnKind | "all" = typeof params.kind === "string" && supportedKinds.includes(params.kind) ? params.kind as TrustedAddOnKind : "all";
	const config = await getUserConfigForRequest();
	// Library membership is not evidence that an item is installed on a Worker.
	const installedIds = config.customLoadout.map((entry) => entry.id);
	const tab = params.tab === "skills" || params.tab === "mcps" ? params.tab : "catalog";
	const catalogSlugs = new Set(tab === "skills" ? listSkills().map(skill => skill.slug) : []);
	const skills = tab === "skills" ? importedSkills(config).filter(skill => catalogSlugs.has(skill.slug)) : [];
	const customSkills = config.customLoadout.filter(entry => entry.kind === "skill" && entry.enabled && !entry.id.startsWith("skill-"));

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="Toolkit"
				title="Toolkit"
				description="Find an ability. Review it. Put it to work."
				right={<Link href="/dashboard/loadout" className={cn("inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--ret-border)] px-4 text-sm font-medium transition-colors duration-150 hover:bg-[var(--ret-surface)] focus-visible:outline-2")}><Layers className={cn("size-4")} aria-hidden="true" />Your loadout<ArrowUpRight className={cn("size-4 text-[var(--ret-text-muted)]")} aria-hidden="true" /></Link>}
			/>
			<WorkspaceTabs label="Toolkit sections" active={tab} items={TOOLKIT_TABS} />
			{tab === "catalog" ? <>
				<div className="mx-[var(--dashboard-gutter,20px)] mt-4 grid gap-3 rounded-lg bg-[var(--ret-bg-soft)] p-4 sm:grid-cols-3">
					{[{ icon: SearchOutline, title: "Discover", detail: "Inspect source and requirements." }, { icon: Bookmark, title: "Save", detail: "Build your reusable tool library." }, { icon: Plug2, title: "Install", detail: "Choose a machine and review changes." }].map(({ icon: Icon, title, detail }, i) => <div key={title} className="flex items-center gap-3"><Icon size={20} className="shrink-0 text-[var(--ret-text-muted)]" aria-hidden="true" /><div className="min-w-0 flex-1"><h2 className="text-sm font-medium">{title}</h2><p className="mt-1 text-xs leading-5 text-[var(--ret-text-muted)]">{detail}</p></div>{i < 2 ? <ArrowRight size={14} className="hidden shrink-0 text-[var(--ret-text-muted)] sm:block" aria-hidden="true" /> : null}</div>)}
				</div>
				<RegistryBrowser key={`${initialKind}:${initialQuery}`} initialQuery={initialQuery} initialKind={initialKind} installedIds={installedIds} machines={config.machines.filter((machine) => !machine.archived).map(({ id, name }) => ({ id, name }))} activeMachineId={config.activeMachineId} />
			</> : tab === "skills" ? <SkillsBrowser skills={skills} categories={[...new Set(skills.map(skill => skill.category))].sort()} customSkills={customSkills} /> : <DashboardPageBody><McpLibrary servers={importedMcps(config)} /></DashboardPageBody>}
		</div>
	);
}
