import { OverviewClient } from "@/components/dashboard/OverviewClient";
import { OverviewGettingStarted } from "@/components/dashboard/OverviewGettingStarted";
import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { WorkerLaunchpad } from "@/components/dashboard/WorkerLaunchpad";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { getUserConfigForRequest } from "@/lib/user-config/clerk";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  let savedSetupCount = 0;
  let hasMachines = false;
  try {
    const config = await getUserConfigForRequest();
    savedSetupCount = config.workers.length;
    hasMachines = config.machines.some((machine) => !machine.archived);
  } catch {
    // The authenticated shell owns config/auth errors.
  }
  return (
    <div className="flex flex-col">
      <PageHeader kicker="Workspace" title="Overview" description="Your agent workspaces, saved setups, and next steps."
        right={<ReticleButton as="a" href="/dashboard/agents" variant="ghost">Saved setups</ReticleButton>} />
      <DashboardPageBody>
        <OverviewGettingStarted />
        {hasMachines ? <OverviewClient savedSetupCount={savedSetupCount} /> : null}
        {hasMachines ? (
          <details className="group rounded-xl border border-[var(--ret-border)] bg-[var(--ret-bg)]">
            <summary className="cursor-pointer px-5 py-5 text-base font-medium focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">Launch another workspace</summary>
            <div className="border-t border-[var(--ret-border)] p-4"><WorkerLaunchpad /></div>
          </details>
        ) : <WorkerLaunchpad />}
      </DashboardPageBody>
    </div>
  );
}
