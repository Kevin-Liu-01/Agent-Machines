"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, FolderOpen, ScrollText, SquareTerminal } from "@/components/ui/icons";
import { useDashboardConfig } from "@/components/dashboard/DashboardConfigProvider";
import { DashboardLoadingState } from "@/components/dashboard/DashboardLoadingState";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import type { ActivityEvent, ActivityPayload } from "@/lib/dashboard/activity/types";
import { AGENT_LABEL, PROVIDER_KINDS, PROVIDER_LABEL, type PublicMachineRef } from "@/lib/user-config/schema";

type LiveMachine = PublicMachineRef & {
  live: { ok: true; state: string; lastError: string | null } | { ok: false; reason: string };
};

/** A small, read-only fleet summary. Never probes an HTTP gateway or wakes compute. */
export function OverviewClient({ savedSetupCount }: { savedSetupCount: number }) {
  const config = useDashboardConfig();
  const [machines, setMachines] = useState<LiveMachine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      if (controller.signal.aborted) return;
      if (document.visibilityState !== "visible") { timer = setTimeout(tick, 12_000); return; }
      try {
        const response = await fetch("/api/dashboard/machines", { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok || !body.ok || !Array.isArray(body.machines)) throw new Error(body.message ?? "Workspace status is unavailable.");
        if (!controller.signal.aborted) {
          setMachines(body.machines.filter((machine: LiveMachine) => !machine.archived));
          setError(null);
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Workspace status is unavailable.");
      }
      if (!controller.signal.aborted) timer = setTimeout(tick, 12_000);
    }
    void tick();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [refreshKey]);

  const recorded = config?.machines.filter((machine) => !machine.archived) ?? [];
  const display = machines ?? recorded;
  const activeId = config?.activeMachineId;
  const active = display.find((machine) => machine.id === activeId) ?? display[0];
  const recent = [...display].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const running = error || !machines ? "—" : machines.filter((machine) => machine.live.ok && machine.live.state === "ready").length;
  const providerCount = config ? PROVIDER_KINDS.filter((kind) => config.providers[kind].configured).length : "—";

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-[var(--ret-border)] bg-[var(--ret-bg)] lg:grid-cols-4">
        {[["Workspaces", !machines && !config ? "—" : display.length], ["Reported running", running], ["Saved setups", savedSetupCount], ["Compute accounts", providerCount]].map(([label, value]) => (
          <div key={label} className="border-b border-r border-[var(--ret-border)] px-5 py-5 last:border-r-0 lg:border-b-0">
            <dt className="text-sm text-[var(--ret-text-muted)]">{label}</dt>
            <dd className="mt-2 text-2xl font-medium tabular-nums text-[var(--ret-text)]">{value}</dd>
          </div>
        ))}
      </dl>
      {error ? <div role="alert" className="rounded-lg border border-[var(--ret-amber)]/30 px-4 py-3 text-sm text-[var(--ret-amber)]">{error} Showing saved workspace records. <button type="button" onClick={() => setRefreshKey((key) => key + 1)} className="ml-2 min-h-9 underline focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">Retry status</button></div> : null}
      {!machines && !config && !error ? <DashboardLoadingState label="Loading your workspaces…" variant="table" /> : null}
      {active ? (
        <section className="rounded-xl border border-[var(--ret-border)] bg-[var(--ret-bg)] p-5 sm:p-6" aria-labelledby="continue-work-title">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-[var(--ret-text-muted)]">{active.id === activeId ? "Selected workspace" : "Recent workspace"}</p>
              <h2 id="continue-work-title" className="mt-2 break-words text-xl font-medium text-[var(--ret-text)]">{active.name}</h2>
              <p className="mt-2 text-sm text-[var(--ret-text-dim)]">{AGENT_LABEL[active.agentKind]} · {PROVIDER_LABEL[active.providerKind]} · {active.model}</p>
            </div>
            <ReticleButton as="a" href={`/dashboard/machines/${encodeURIComponent(active.id)}/terminal`} variant="primary"><SquareTerminal size={18} aria-hidden="true" /> Open terminal</ReticleButton>
          </div>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--ret-border)] pt-4 text-sm">
            {[["console", "Agent console", SquareTerminal], ["artifacts", "Workspace files", FolderOpen], ["logs", "Activity & logs", ScrollText], ["", "Manage workspace", ArrowRight]].map(([path, label, Icon]) => {
              const Mark = Icon as typeof ArrowRight;
              return <Link key={String(path)} href={`/dashboard/machines/${encodeURIComponent(active.id)}${path ? `/${path}` : ""}`} className="inline-flex min-h-9 items-center gap-2 text-[var(--ret-text-dim)] hover:text-[var(--ret-purple)] focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]"><Mark size={16} aria-hidden="true" />{label as string}</Link>;
            })}
          </div>
        </section>
      ) : null}
      {recent.length ? (
        <section className="overflow-hidden rounded-xl border border-[var(--ret-border)] bg-[var(--ret-bg)]" aria-labelledby="recent-workspaces-title">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--ret-border)] px-5 py-4"><h2 id="recent-workspaces-title" className="text-lg font-medium">Workspaces</h2><Link href="/dashboard/machines" className="min-h-9 content-center text-sm text-[var(--ret-purple)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">View fleet →</Link></div>
          <ul className="divide-y divide-[var(--ret-border)]">{recent.map((machine) => {
            const live = machines?.find((item) => item.id === machine.id)?.live;
            const state = error ? "Status unavailable" : live ? live.ok ? live.state === "ready" ? "Running" : live.state : "Unavailable" : "Checking status…";
            return <li key={machine.id} className="flex flex-wrap items-center gap-4 px-5 py-4"><div className="min-w-0 flex-1"><Link href={`/dashboard/machines/${encodeURIComponent(machine.id)}`} className="text-[15px] font-medium hover:text-[var(--ret-purple)] focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">{machine.name}</Link><p className="mt-1 text-sm text-[var(--ret-text-muted)]">{AGENT_LABEL[machine.agentKind]} · {PROVIDER_LABEL[machine.providerKind]}</p></div><span className="text-sm text-[var(--ret-text-muted)]">{state}</span><Link href={`/dashboard/machines/${encodeURIComponent(machine.id)}/terminal`} aria-label={`Open terminal for ${machine.name}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--ret-border)] px-3 text-sm hover:bg-[var(--ret-surface)] focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]"><SquareTerminal size={16} aria-hidden="true" />Terminal</Link></li>;
          })}</ul>
        </section>
      ) : null}
      <RecordedActivity />
    </div>
  );
}

function RecordedActivity() {
	const [events, setEvents] = useState<ActivityEvent[] | null>(null);
	const [error, setError] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);
	useEffect(() => {
		const controller = new AbortController();
		let timer: ReturnType<typeof setTimeout>;
		async function refresh() {
			if (controller.signal.aborted) return;
			if (document.visibilityState !== "visible") {
				timer = setTimeout(refresh, 30_000);
				return;
			}
			try {
				const response = await fetch("/api/dashboard/activity", { cache: "no-store", signal: controller.signal });
				const body = await response.json() as ActivityPayload;
				if (!response.ok || !body.ok || !Array.isArray(body.days)) throw new Error("Activity unavailable");
				if (!controller.signal.aborted) {
					setEvents(body.days.flatMap((day) => day.events).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6));
					setError(false);
				}
			} catch {
				if (!controller.signal.aborted) setError(true);
			}
			if (!controller.signal.aborted) timer = setTimeout(refresh, 30_000);
		}
		void refresh();
		return () => { controller.abort(); clearTimeout(timer); };
	}, [refreshKey]);

	return (
		<section className="overflow-hidden rounded-xl border border-[var(--ret-border)] bg-[var(--ret-bg)]" aria-labelledby="recorded-activity-title">
			<div className="border-b border-[var(--ret-border)] px-5 py-4">
				<h2 id="recorded-activity-title" className="text-lg font-medium">Recent activity</h2>
				<p className="mt-1 text-sm leading-6 text-[var(--ret-text-muted)]">Workspace lifecycle events</p>
			</div>
			{error ? (
				<p role="alert" className="px-5 py-4 text-sm text-[var(--ret-amber)]">Activity is unavailable. <button type="button" onClick={() => setRefreshKey((key) => key + 1)} className="min-h-9 underline focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">Retry</button></p>
			) : events === null ? (
				<DashboardLoadingState label="Loading recorded activity…" variant="table" className="p-5" />
			) : events.length === 0 ? (
				<div className="px-5 py-6 text-sm text-[var(--ret-text-muted)]"><p>No recorded activity yet.</p><Link href="/dashboard/machines" className="mt-2 inline-flex min-h-11 items-center gap-2 text-[var(--ret-purple)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--ret-purple)]">Open your workspaces<ArrowRight size={16} aria-hidden="true" /></Link></div>
			) : (
				<ul className="divide-y divide-[var(--ret-border)]">
					{events.map((event) => (
						<li key={event.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
							<ScrollText size={18} aria-hidden="true" className="mt-1 shrink-0 text-[var(--ret-text-muted)]" />
							<div className="min-w-0 flex-1"><p className="break-words text-[15px] text-[var(--ret-text)]">{event.title}</p><p className="mt-1 text-sm text-[var(--ret-text-muted)]">{event.subtitle}</p></div>
							<time dateTime={event.at} className="text-sm tabular-nums text-[var(--ret-text-muted)]">{new Date(event.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
