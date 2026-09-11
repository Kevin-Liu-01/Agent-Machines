import { EmptyState } from "./EmptyState";
import { PageHeader } from "./PageHeader";
import { DashboardPageBody } from "./DashboardPageBody";
import { WorkspaceTabs, TOOLKIT_TABS } from "./WorkspaceTabs";
import { Server, ArrowRight, SquareTerminal, FolderOpen, History, Boxes } from "@/components/ui/icons";

/** Fleet shortcuts explain their prerequisite instead of silently changing page. */
export function MachineRequired({ title, description }: { title: string; description: string }) {
	const isLoadout = /loadout/i.test(title);
	const stages = isLoadout
		? [{ icon: Boxes, title: "Select abilities", detail: "Choose skills and integrations from your library." }, { icon: Server, title: "Review the target", detail: "Check credentials and compatibility on a machine." }, { icon: SquareTerminal, title: "Install & inspect", detail: "Apply the loadout and review the result." }]
		: [{ icon: Server, title: "Choose a workspace", detail: "Each machine has its own runtime and state." }, { icon: /artifact/i.test(title) ? FolderOpen : SquareTerminal, title: `Open ${title.toLowerCase()}`, detail: "Work with the selected machine, not an account-wide session." }, { icon: History, title: "Inspect the result", detail: "Return to the same workspace for files and recorded activity." }];
	return <div className="flex flex-col">
		<PageHeader kicker="Workspace" title={title} description={description} />
		{isLoadout ? <WorkspaceTabs label="Toolkit sections" active="loadout" items={TOOLKIT_TABS} /> : null}
		<DashboardPageBody><ol className="grid gap-4 rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-4 sm:grid-cols-3">{stages.map(({ icon: Icon, title: label, detail }, index) => <li key={label} className="flex min-w-0 gap-3"><Icon size={22} aria-hidden="true" className="shrink-0 text-[var(--ret-text-muted)]" /><div className="min-w-0 flex-1"><h2 className="text-sm font-medium">{label}</h2><p className="mt-1 text-sm leading-6 text-[var(--ret-text-dim)]">{detail}</p></div>{index < 2 ? <ArrowRight size={15} aria-hidden="true" className="hidden shrink-0 text-[var(--ret-text-muted)] sm:block" /> : null}</li>)}</ol></DashboardPageBody>
		<EmptyState title="Choose a machine to continue" description="Open a machine from your fleet to use this view, or set up your first Worker." action={{ label: "Open your fleet", href: "/dashboard/machines" }} secondaryAction={{ label: "Set up a Worker", href: "/dashboard/setup" }} />
	</div>;
}
