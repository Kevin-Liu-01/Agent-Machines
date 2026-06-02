import Link from "next/link";
import { notFound } from "next/navigation";

import { MachineRouterCard } from "@/components/dashboard/MachineRouterCard";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { buildPool } from "@/lib/dashboard/pool";
import { resolveAbilities } from "@/lib/memory/abilities";
import { defaultMemoryBundle, resolveBundle } from "@/lib/memory/bundle";
import { getUserConfig } from "@/lib/user-config/clerk";
import { AGENT_LABEL } from "@/lib/user-config/schema";
import { resolveMachineWorker } from "@/lib/workers/resolve";

export const dynamic = "force-dynamic";

export default async function MachineLoadoutPage({
	params,
}: {
	params: Promise<{ machineId: string }>;
}) {
	const { machineId } = await params;
	const config = await getUserConfig();
	const machine = config.machines.find((m) => m.id === machineId);
	if (!machine) notFound();

	const worker = resolveMachineWorker(config, machine);
	const memory = resolveBundle(config, worker.memoryBundleId) ?? defaultMemoryBundle();
	const abilities = resolveAbilities(memory, buildPool(config));

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="LOADOUT"
				title="This machine's loadout"
				description="The deployed Worker, its Memory, and the abilities that Memory selects from your imported pool. Import more in the Registry; reshape the selection in Memory."
			/>
			<MachineRouterCard />

			<div className="grid gap-5 px-6 py-6">
				<ReticleFrame>
					<div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ret-border)] px-5 py-4">
						<div>
							<ReticleLabel>worker</ReticleLabel>
							<p className="mt-1 text-[14px] text-[var(--ret-text)]">{worker.name}</p>
						</div>
						<div className="flex items-center gap-2">
							<ReticleBadge variant={worker.source === "default" ? "default" : "accent"}>
								{worker.source}
							</ReticleBadge>
							<span className="font-mono text-[11px] text-[var(--ret-text-muted)]">
								{AGENT_LABEL[worker.agentKind]} . {worker.model}
							</span>
						</div>
					</div>
					<div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
						<div className="min-w-0">
							<ReticleLabel>memory</ReticleLabel>
							<p className="mt-1 text-[13px] text-[var(--ret-text)]">{memory.name}</p>
							<p className="mt-0.5 line-clamp-2 text-[11px] text-[var(--ret-text-dim)]">
								{memory.description || "No description."}
							</p>
						</div>
						<Link
							href={`/dashboard/memory/${memory.id}`}
							className="border border-[var(--ret-border)] bg-[var(--ret-bg)] px-3 py-1.5 font-mono text-[11px] text-[var(--ret-text-dim)] transition-colors hover:border-[var(--ret-purple)]/40 hover:text-[var(--ret-text)]"
						>
							Edit memory →
						</Link>
					</div>
				</ReticleFrame>

				<AbilityList title={`Skills . ${abilities.skills.length}`} items={abilities.skills} emptyHref />
				<AbilityList title={`MCP servers . ${abilities.mcps.length}`} items={abilities.mcps} emptyHref />
				<AbilityList title={`Built-in tools . ${abilities.tools.length}`} items={abilities.tools} />
			</div>
		</div>
	);
}

function AbilityList({
	title,
	items,
	emptyHref = false,
}: {
	title: string;
	items: Array<{ id: string; name: string; description: string }>;
	emptyHref?: boolean;
}) {
	return (
		<ReticleFrame>
			<div className="border-b border-[var(--ret-border)] px-5 py-3">
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{title}
				</p>
			</div>
			{items.length === 0 ? (
				<div className="px-5 py-6 text-center text-[12px] text-[var(--ret-text-muted)]">
					Nothing selected.{" "}
					{emptyHref ? (
						<Link href="/dashboard/registry" className="text-[var(--ret-purple)] hover:underline">
							Import from the Registry
						</Link>
					) : null}
				</div>
			) : (
				<ul className="grid gap-x-6 gap-y-1 px-5 py-4 md:grid-cols-2">
					{items.map((item) => (
						<li key={item.id} className="flex items-baseline gap-2 py-0.5">
							<span className="font-mono text-[12px] text-[var(--ret-text)]">{item.name}</span>
							<span className="truncate text-[11px] text-[var(--ret-text-muted)]">
								{item.description}
							</span>
						</li>
					))}
				</ul>
			)}
		</ReticleFrame>
	);
}
