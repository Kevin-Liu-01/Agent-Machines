import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleHatch } from "@/components/reticle/ReticleHatch";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ServiceIcon, type ServiceSlug } from "@/components/ServiceIcon";
import { ToolIcon } from "@/components/ToolIcon";
import { WingBackground } from "@/components/WingBackground";
import { TRUSTED_ADDONS, type TrustedAddOnKind, type ToolCategory } from "@/lib/dashboard/loadout";

type ShowcaseItem = {
	name: string;
	kind: TrustedAddOnKind;
	brand: ServiceSlug | null;
	provider: string;
	description: string;
};

const KIND_TO_CATEGORY: Record<TrustedAddOnKind, ToolCategory> = {
	skill: "memory",
	mcp: "delegate",
	cli: "shell",
	tool: "code",
	plugin: "code",
	provider: "filesystem",
	source: "search",
};

const KIND_BADGE: Record<TrustedAddOnKind, "default" | "accent" | "success" | "warning"> = {
	skill: "accent",
	mcp: "success",
	cli: "warning",
	tool: "default",
	plugin: "accent",
	provider: "success",
	source: "default",
};

const FEATURED: ShowcaseItem[] = TRUSTED_ADDONS
	.filter((a) => a.brand)
	.slice(0, 30)
	.map((a) => ({
		name: a.name,
		kind: a.kind,
		brand: (a.brand as ServiceSlug) ?? null,
		provider: a.provider,
		description: a.description,
	}));

const SOURCES = [
	{ label: "skills.sh", count: "34K+ skills", icon: "memory" as ToolCategory },
	{ label: "MCP Registry", count: "200+ servers", icon: "delegate" as ToolCategory },
	{ label: "npm", count: "2M+ packages", icon: "shell" as ToolCategory },
	{ label: "Cursor Plugins", count: "50+ plugins", icon: "code" as ToolCategory },
	{ label: "GitHub Repos", count: "any owner/repo", icon: "search" as ToolCategory },
	{ label: "URL Manifests", count: "JSON / YAML", icon: "filesystem" as ToolCategory },
];

const KIND_COUNTS: Record<string, number> = {};
for (const addon of TRUSTED_ADDONS) {
	KIND_COUNTS[addon.kind] = (KIND_COUNTS[addon.kind] ?? 0) + 1;
}

export function RegistryShowcase() {
	return (
		<>
			<div className="flex items-baseline justify-between gap-3">
				<div>
					<ReticleLabel>REGISTRY</ReticleLabel>
					<h2 className="ret-display mt-2 text-xl md:text-2xl">
						Browse. Add. Install.
					</h2>
				</div>
				<ReticleButton
					as="a"
					href="/registry"
					variant="secondary"
					size="sm"
				>
					Browse registry
				</ReticleButton>
			</div>

			<p className="mt-2 max-w-[80ch] text-[12px] text-[var(--ret-text-dim)]">
				Six live sources. One search bar. Click <strong className="text-[var(--ret-text)]">Add</strong> to
				write to your config and install on the machine in a single action.
				Skills, MCP servers, CLIs, tools, plugins, and providers -- all
				normalized into the same card grid with brand logos.
			</p>

			{/* Source strip */}
			<div className="mt-4 grid grid-cols-2 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)] sm:grid-cols-3 lg:grid-cols-6">
				{SOURCES.map((s) => (
					<div
						key={s.label}
						className="flex flex-col gap-1 bg-[var(--ret-bg)] px-3 py-2.5 transition-colors hover:bg-[var(--ret-surface)]"
					>
						<div className="flex items-center gap-1.5">
							<ToolIcon
								name={s.icon}
								size={12}
								className="text-[var(--ret-text-muted)]"
							/>
							<p className="font-mono text-[11px] text-[var(--ret-text)]">
								{s.label}
							</p>
						</div>
						<p className="font-mono text-[10px] text-[var(--ret-text-muted)]">
							{s.count}
						</p>
					</div>
				))}
			</div>

			{/* Logo grid */}
			<div className="mt-px grid grid-cols-2 gap-px overflow-hidden border border-[var(--ret-border)] border-t-0 bg-[var(--ret-border)] sm:grid-cols-3 lg:grid-cols-6">
				{FEATURED.map((item) => (
					<div
						key={item.name}
						className="group flex flex-col items-center gap-2 bg-[var(--ret-bg)] px-3 py-4 transition-colors hover:bg-[var(--ret-surface)]"
					>
						{item.brand ? (
							<ServiceIcon slug={item.brand} size={28} tone="color" />
						) : (
							<ToolIcon
								name={KIND_TO_CATEGORY[item.kind]}
								size={28}
								className="text-[var(--ret-text-muted)]"
							/>
						)}
						<p className="text-center font-mono text-[11px] text-[var(--ret-text)] group-hover:text-[var(--ret-purple)]">
							{item.name}
						</p>
						<ReticleBadge
							variant={KIND_BADGE[item.kind]}
							className="text-[9px]"
						>
							{item.kind}
						</ReticleBadge>
					</div>
				))}
			</div>

			{/* Kind breakdown + CTA */}
			<div className="mt-px grid grid-cols-1 gap-px overflow-hidden border border-[var(--ret-border)] border-t-0 bg-[var(--ret-border)] md:grid-cols-[1.2fr_0.8fr]">
				<div className="relative overflow-hidden bg-[var(--ret-bg)] p-4">
					<WingBackground
						variant="nyx-waves"
						opacity={{ light: 0.1, dark: 0.24 }}
						fadeEdges
					/>
					<div className="relative z-10">
						<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							{TRUSTED_ADDONS.length} add-ons across {Object.keys(KIND_COUNTS).length} kinds
						</p>
						<div className="mt-2 flex flex-wrap gap-2">
							{Object.entries(KIND_COUNTS)
								.sort((a, b) => b[1] - a[1])
								.map(([kind, count]) => (
									<span
										key={kind}
										className="flex items-center gap-1 border border-[var(--ret-border)] bg-[var(--ret-surface)] px-2 py-1 font-mono text-[10px] text-[var(--ret-text-dim)]"
									>
										<ToolIcon
											name={KIND_TO_CATEGORY[kind as TrustedAddOnKind] ?? "code"}
											size={10}
											className="text-[var(--ret-text-muted)]"
										/>
										{kind}
										<span className="ml-1 tabular-nums text-[var(--ret-text-muted)]">
											{count}
										</span>
									</span>
								))}
						</div>
					</div>
				</div>
				<div className="relative overflow-hidden bg-[var(--ret-bg)] p-4">
					<WingBackground
						variant="nyx-lines"
						opacity={{ light: 0.1, dark: 0.24 }}
						fadeEdges
					/>
					<div className="relative z-10 flex h-full flex-col justify-center">
						<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							one-click install
						</p>
						<p className="mt-1 text-[11px] text-[var(--ret-text-dim)]">
							Search any source. Click Add. Config writes to Clerk, install runs
							on the VM. The agent picks it up on the next turn.
						</p>
						<ReticleHatch
							className="mt-3 h-px border-t border-[var(--ret-border)]"
							pitch={6}
						/>
						<div className="mt-3 flex items-center gap-2 font-mono text-[10px] text-[var(--ret-text-muted)]">
							<span>config</span>
							<span className="text-[var(--ret-purple)]">{"→"}</span>
							<span>install</span>
							<span className="text-[var(--ret-purple)]">{"→"}</span>
							<span>loadout</span>
						</div>
					</div>
				</div>
			</div>
		</>
	);
}
