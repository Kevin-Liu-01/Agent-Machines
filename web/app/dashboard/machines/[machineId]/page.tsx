"use client";

import { useEffect, useState } from "react";

import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import {
	MachineActions,
	type MachineState as MachineActionState,
} from "@/components/dashboard/MachineActions";
import { useMachineContext } from "@/components/dashboard/MachineProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { Skeleton } from "@/components/ui/Skeleton";
import { AGENT_LABEL, PROVIDER_LABEL } from "@/lib/user-config/schema";

type MachineStatus = {
	state: string;
	rawPhase: string;
	lastError: string | null;
};

export default function MachineOverviewPage() {
	const { machineId, machine } = useMachineContext();
	const [status, setStatus] = useState<MachineStatus | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let stopped = false;
		async function poll() {
			try {
				const res = await fetch("/api/dashboard/machine", { cache: "no-store" });
				if (!res.ok || stopped) return;
				const data = await res.json();
				if (!stopped) setStatus({ state: data.phase, rawPhase: data.phase, lastError: null });
			} catch {
				/* ignore */
			} finally {
				if (!stopped) setLoading(false);
			}
		}
		poll();
		const id = window.setInterval(() => {
			if (document.visibilityState === "visible") poll();
		}, 5000);
		return () => { stopped = true; window.clearInterval(id); };
	}, [machineId]);

	if (!machine) return null;

	const memGib = (machine.spec.memoryMib / 1024).toFixed(1);
	const stateName = status?.state ?? "loading";

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker={`MACHINE -- ${machine.name}`}
				title={machine.name}
				description={`${PROVIDER_LABEL[machine.providerKind]} / ${AGENT_LABEL[machine.agentKind]} / ${machine.model}`}
				right={
					<MachineActions
						machineId={machineId}
						state={stateName as MachineActionState}
						capabilities={null}
						active
						archived={machine.archived ?? false}
						allowDestroy
						onChange={async () => {}}
					/>
				}
			/>
			<DashboardPageBody>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					<StatCard label="Status">
						{loading ? (
							<Skeleton className="h-4 w-20" />
						) : (
							<ReticleBadge
								variant={stateName === "running" || stateName === "ready" ? "accent" : "default"}
							>
								{stateName}
							</ReticleBadge>
						)}
					</StatCard>
					<StatCard label="Provider">
						{PROVIDER_LABEL[machine.providerKind]}
					</StatCard>
					<StatCard label="Agent">
						{AGENT_LABEL[machine.agentKind]}
					</StatCard>
					<StatCard label="Spec">
						{machine.spec.vcpu}v / {memGib}G RAM / {machine.spec.storageGib}G disk
					</StatCard>
					<StatCard label="Model">
						{machine.model}
					</StatCard>
					<StatCard label="Machine ID" mono>
						{machineId}
					</StatCard>
				</div>
			</DashboardPageBody>
		</div>
	);
}

function StatCard({
	label,
	children,
	mono,
}: {
	label: string;
	children: React.ReactNode;
	mono?: boolean;
}) {
	return (
		<ReticleFrame>
			<div className="px-4 py-3">
				<dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{label}
				</dt>
				<dd className={`mt-1 text-[13px] text-[var(--ret-text)] ${mono ? "font-mono text-[11px]" : ""}`}>
					{children}
				</dd>
			</div>
		</ReticleFrame>
	);
}
