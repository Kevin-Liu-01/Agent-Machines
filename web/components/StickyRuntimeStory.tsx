import { Logo } from "@/components/Logo";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ServiceIcon, type ServiceSlug } from "@/components/ServiceIcon";
import { WireframeMachine } from "@/components/three";
import { ToolIcon } from "@/components/ToolIcon";
import { WingBackground } from "@/components/WingBackground";
import { TRUSTED_ADDONS, type ToolCategory, type TrustedAddOnKind } from "@/lib/dashboard/loadout";

type Stage = {
	kicker: string;
	title: string;
	body: string;
	nodes: readonly string[];
	accent: string;
};

const STAGES: ReadonlyArray<Stage> = [
	{
		kicker: "stage 01",
		title: "Account settings become a machine recipe.",
		body: "Provider, agent, gateway, env, tools, and custom loadout are not onboarding-only values. They are durable account objects that every new machine can inherit.",
		nodes: ["account", "profiles", "bootstrap"],
		accent: "var(--ret-purple)",
	},
	{
		kicker: "stage 02",
		title: "The runtime router chooses the host shape.",
		body: "Dedalus and Fly are persistent machine lanes. Vercel Sandbox is an ephemeral session lane with external storage. The UI only shows lifecycle actions that lane can actually do.",
		nodes: ["provider", "capability", "host"],
		accent: "var(--ret-green)",
	},
	{
		kicker: "stage 03",
		title: "Four agents install into the same durable boundary.",
		body: "Autonomous agents (Hermes, OpenClaw) have built-in drivers that wake on schedule. Task-driven CLIs (Claude Code, Codex) run per-task. All share the same gateway surface and persist state under /home/machine.",
		nodes: ["agent", "gateway", "disk"],
		accent: "var(--ret-amber)",
	},
	{
		kicker: "stage 04",
		title: "The dashboard reads the same system the agent writes.",
		body: "Chats, artifacts, logs, terminal, sessions, and settings all converge on the same storage and provider execution model.",
		nodes: ["chat", "artifacts", "observability"],
		accent: "var(--ret-purple)",
	},
	{
		kicker: "stage 05",
		title: "Browse and install from six live registries.",
		body: "skills.sh, the MCP server registry, npm, Cursor plugins, GitHub repos, and URL manifests -- all searchable from one page. Click Add to write config and install on the machine.",
		nodes: ["skills", "mcps", "tools"],
		accent: "var(--ret-green)",
	},
];

export function StickyRuntimeStory() {
	return (
		<section className="grid gap-px border border-[var(--ret-border)] bg-[var(--ret-border)] lg:grid-cols-[0.72fr_1.28fr]">
			<div className="flex flex-col bg-[var(--ret-bg)] p-4 lg:sticky lg:top-[92px] lg:h-[calc(100dvh-120px)]">
				<ReticleLabel>SCROLL RUNTIME</ReticleLabel>
				<h2 className="ret-display mt-3 max-w-[13ch] text-3xl md:text-4xl">
					Watch the agent machine assemble.
				</h2>
				<p className="mt-4 max-w-[50ch] text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
					This section behaves like a locked product diagram: the copy stays
					stable while each workflow panel slides into place as you scroll.
					No fake dashboard screenshots, just the actual account {"->"} provider
					{"->"} agent {"->"} storage {"->"} registry model.
				</p>
				<ReticleFrame className="mt-6" corners={false}>
					<div className="grid gap-px bg-[var(--ret-border)]">
						{["settings", "provider", "agent", "data", "registry"].map((item, index) => (
							<div key={item} className="flex items-center justify-between bg-[var(--ret-bg-soft)] px-3 py-2">
								<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
									{item}
								</span>
								<span className="font-mono text-[10px] text-[var(--ret-text)]">
									{String(index + 1).padStart(2, "0")}
								</span>
							</div>
						))}
					</div>
				</ReticleFrame>
				<div className="mt-4 flex-1">
					<WireframeMachine className="h-full min-h-[160px] w-full" />
				</div>
			</div>
			<div className="bg-[var(--ret-bg)]">
				{STAGES.map((stage, index) => (
					<StoryPanel key={stage.kicker} stage={stage} index={index} />
				))}
			</div>
		</section>
	);
}

function StoryPanel({
	stage,
	index,
}: {
	stage: Stage;
	index: number;
}) {
	return (
		<div className="min-h-[78dvh] border-b border-[var(--ret-border)] p-3 md:p-4">
			<div
				className="sticky top-[92px] grid min-h-[460px] overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] md:grid-cols-[0.78fr_1.22fr]"
				style={{ animation: "ret-panel-in 600ms cubic-bezier(0.16,1,0.3,1) both" }}
			>
				<div className="flex flex-col justify-between border-b border-[var(--ret-border)] bg-[var(--ret-bg)] p-4 md:border-r md:border-b-0">
					<div>
						<ReticleBadge>{stage.kicker}</ReticleBadge>
						<h3 className="ret-display mt-3 max-w-[15ch] text-2xl md:text-3xl">
							{stage.title}
						</h3>
						<p className="mt-3 max-w-[46ch] text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
							{stage.body}
						</p>
					</div>
					<StageMeta index={index} />
				</div>
				<div className="ret-material-field relative min-h-[360px]">
					<WingBackground
						variant={index % 2 === 0 ? "nyx-waves" : "nyx-lines"}
						opacity={{ light: 0.28, dark: 0.48 }}
						fadeEdges
					/>
					<StageContent stage={stage} index={index} />
				</div>
			</div>
		</div>
	);
}

function StageMeta({ index }: { index: number }) {
	if (index === 1) {
		return (
			<div className="mt-6 flex items-center gap-2">
				<Logo mark="dedalus" size={18} />
				<ServiceIcon slug="vercel" size={16} tone="color" />
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					+ fly machines
				</span>
			</div>
		);
	}
	if (index === 2) {
		return (
			<div className="mt-6 flex items-center gap-2">
				<Logo mark="nous" size={18} />
				<Logo mark="openclaw" size={18} />
				<Logo mark="anthropic" size={18} />
				<Logo mark="openai" size={18} />
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					same /v1 gateway
				</span>
			</div>
		);
	}
	if (index === 4) {
		return (
			<div className="mt-6">
				<a
					href="/dashboard/registry"
					className="inline-flex items-center gap-2 border border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ret-purple)] transition-colors hover:bg-[var(--ret-purple)]/20"
				>
					open registry
				</a>
			</div>
		);
	}
	return (
		<div className="mt-6 flex items-center gap-2">
			<Logo mark={index === 0 ? "dedalus" : "agent"} size={18} />
			<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				persistent agent lane
			</span>
		</div>
	);
}

function StageContent({ stage, index }: { stage: Stage; index: number }) {
	switch (index) {
		case 0:
			return <AccountFlowDiagram />;
		case 1:
			return <ProviderComparisonDiagram />;
		case 2:
			return <AgentSplitDiagram />;
		case 3:
			return <DashboardConvergenceDiagram />;
		case 4:
			return <RegistryStageContent />;
		default:
			return null;
	}
}

/* ------------------------------------------------------------------ */
/* Stage 01: Account -- config-to-machine flow                         */
/* ------------------------------------------------------------------ */

const ACCOUNT_FLOW = ["account", "profiles", "gateway", "env", "bootstrap"] as const;

function AccountFlowDiagram() {
	return (
		<div className="relative z-10 flex h-full flex-col justify-between bg-[var(--ret-bg)]/90 p-4 backdrop-blur-sm">
			<div className="ret-material-field absolute inset-0 opacity-40" aria-hidden="true" />
			<div className="relative z-10">
				<ReticleBadge variant="accent" className="text-[9px]">recipe</ReticleBadge>
				<p className="mt-2 font-mono text-[10px] text-[var(--ret-text-dim)]">
					account settings compose into a machine recipe
				</p>
			</div>
			<div className="relative z-10 flex flex-wrap items-center gap-1.5">
				{ACCOUNT_FLOW.map((label, i) => (
					<span key={label} className="flex items-center gap-1.5">
						{i > 0 ? (
							<span className="text-[var(--ret-purple)]">
								<svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M0 3h7M6 1l2 2-2 2" stroke="currentColor" strokeWidth="1" /></svg>
							</span>
						) : null}
						<span className="border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ret-text)]">
							{label}
						</span>
					</span>
				))}
			</div>
			<div className="relative z-10 grid grid-cols-3 gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-border)]">
				{(
					[
						["Clerk metadata", "durable store"],
						["MachineRef[]", "per-user fleet"],
						["BootstrapPreset", "one-click spawn"],
					] as const
				).map(([label, sub]) => (
					<div key={label} className="bg-[var(--ret-bg-soft)] px-2.5 py-2">
						<p className="font-mono text-[9px] text-[var(--ret-text)]">{label}</p>
						<p className="font-mono text-[8px] text-[var(--ret-text-muted)]">{sub}</p>
					</div>
				))}
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Stage 02: Provider -- comparison cards                              */
/* ------------------------------------------------------------------ */

const PROVIDERS = [
	{ name: "Dedalus", caps: ["disk", "wake/sleep", "exec", "tunnel"], accent: "var(--ret-purple)" },
	{ name: "Fly", caps: ["disk", "volume", "machine API", "exec"], accent: "var(--ret-green)" },
	{ name: "Sandbox", caps: ["session exec", "external storage", "ephemeral", "microVM"], accent: "var(--ret-amber)" },
] as const;

function ProviderComparisonDiagram() {
	return (
		<div className="relative z-10 grid h-full grid-cols-3 gap-px bg-[var(--ret-border)] p-px">
			{PROVIDERS.map((p) => (
				<div key={p.name} className="flex flex-col justify-between bg-[var(--ret-bg)]/90 p-3 backdrop-blur-sm">
					<div>
						<div className="mb-2 h-1 w-8" style={{ background: p.accent }} />
						<p className="font-mono text-[11px] font-semibold text-[var(--ret-text)]">{p.name}</p>
					</div>
					<ul className="mt-3 space-y-1.5">
						{p.caps.map((cap) => (
							<li key={cap} className="flex items-center gap-1.5 font-mono text-[9px] text-[var(--ret-text-dim)]">
								<span className="h-1 w-1 shrink-0" style={{ background: p.accent }} />
								{cap}
							</li>
						))}
					</ul>
					<div className="mt-3">
						{p.name === "Dedalus" ? <Logo mark="dedalus" size={14} /> : null}
						{p.name === "Sandbox" ? <ServiceIcon slug="vercel" size={14} /> : null}
					</div>
				</div>
			))}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Stage 03: Agent -- Hermes vs OpenClaw split                         */
/* ------------------------------------------------------------------ */

function AgentSplitDiagram() {
	const agents: Array<{
		mark: "nous" | "openclaw" | "anthropic" | "openai";
		name: string;
		model: string;
		caps: string[];
		accent: string;
	}> = [
		{ mark: "nous", name: "Hermes", model: "autonomous", caps: ["memory", "cron", "sessions", "MCP host"], accent: "var(--ret-purple)" },
		{ mark: "openclaw", name: "OpenClaw", model: "autonomous", caps: ["browser", "shell", "vision", "computer-use"], accent: "var(--ret-amber)" },
		{ mark: "anthropic", name: "Claude Code", model: "task-driven", caps: ["file edit", "shell", "SDK", "headless"], accent: "var(--ret-amber)" },
		{ mark: "openai", name: "Codex CLI", model: "task-driven", caps: ["sandbox", "exec mode", "JSONL", "workspace"], accent: "var(--ret-green)" },
	];

	return (
		<div className="relative z-10 flex h-full flex-col gap-px bg-[var(--ret-border)] p-px">
			<div className="grid flex-1 grid-cols-2 grid-rows-2 gap-px bg-[var(--ret-border)]">
				{agents.map((a) => (
					<div key={a.name} className="flex flex-col justify-between bg-[var(--ret-bg)]/90 p-3 backdrop-blur-sm">
						<div className="flex items-center gap-2">
							<Logo mark={a.mark} size={14} />
							<span className="font-mono text-[11px] font-semibold text-[var(--ret-text)]">{a.name}</span>
						</div>
						<ul className="mt-2 space-y-1">
							{a.caps.map((cap) => (
								<li key={cap} className="flex items-center gap-1.5 font-mono text-[9px] text-[var(--ret-text-dim)]">
									<span className="h-1 w-1 shrink-0" style={{ background: a.accent }} />
									{cap}
								</li>
							))}
						</ul>
						<span className="mt-2 inline-block self-start border border-[var(--ret-border)] px-1 py-0.5 font-mono text-[7px] uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">
							{a.model}
						</span>
					</div>
				))}
			</div>
			<div className="flex items-center justify-center gap-3 bg-[var(--ret-bg)]/90 px-4 py-3 backdrop-blur-sm">
				<span className="h-px flex-1 bg-[var(--ret-purple)]/40" />
				<span className="font-mono text-[10px] text-[var(--ret-text)]">/v1 gateway</span>
				<span className="h-px flex-1 bg-[var(--ret-purple)]/40" />
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Stage 04: Dashboard -- data convergence 6-cell grid                 */
/* ------------------------------------------------------------------ */

const DASHBOARD_SURFACES: Array<{ label: string; icon: ToolCategory }> = [
	{ label: "chat", icon: "memory" },
	{ label: "terminal", icon: "shell" },
	{ label: "logs", icon: "search" },
	{ label: "sessions", icon: "filesystem" },
	{ label: "artifacts", icon: "image" },
	{ label: "settings", icon: "code" },
];

function DashboardConvergenceDiagram() {
	return (
		<div className="relative z-10 flex h-full flex-col gap-px bg-[var(--ret-border)] p-px">
			<div className="grid flex-1 grid-cols-3 gap-px bg-[var(--ret-border)]">
				{DASHBOARD_SURFACES.map((s) => (
					<div key={s.label} className="flex flex-col items-center justify-center gap-2 bg-[var(--ret-bg)]/90 py-4 backdrop-blur-sm">
						<ToolIcon name={s.icon} size={18} className="text-[var(--ret-text-muted)]" />
						<span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ret-text)]">{s.label}</span>
					</div>
				))}
			</div>
			<div className="flex items-center justify-center gap-3 bg-[var(--ret-bg)]/90 px-4 py-3 backdrop-blur-sm">
				<ToolIcon name="filesystem" size={12} className="text-[var(--ret-purple)]" />
				<span className="font-mono text-[10px] text-[var(--ret-text)]">/home/machine/.agent-machines</span>
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Stage 05: Registry -- brand logo grid + source chips + install flow */
/* ------------------------------------------------------------------ */

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

const REGISTRY_BRANDS: Array<{ name: string; slug: ServiceSlug; kind: TrustedAddOnKind }> =
	TRUSTED_ADDONS.filter((a): a is typeof a & { brand: ServiceSlug } => Boolean(a.brand))
		.reduce<Array<{ name: string; slug: ServiceSlug; kind: TrustedAddOnKind }>>((acc, a) => {
			if (!acc.some((x) => x.slug === a.brand)) {
				acc.push({ name: a.name, slug: a.brand!, kind: a.kind });
			}
			return acc;
		}, [])
		.slice(0, 15);

const REGISTRY_SOURCES = [
	{ label: "skills.sh", icon: "memory" as ToolCategory },
	{ label: "MCP Registry", icon: "delegate" as ToolCategory },
	{ label: "npm", icon: "shell" as ToolCategory },
	{ label: "Cursor", icon: "code" as ToolCategory },
	{ label: "GitHub", icon: "search" as ToolCategory },
	{ label: "URL", icon: "filesystem" as ToolCategory },
];

function RegistryStageContent() {
	return (
		<div className="relative z-10 flex h-full flex-col gap-px bg-[var(--ret-border)] p-px">
			{/* Source strip */}
			<div className="grid grid-cols-6 gap-px bg-[var(--ret-border)]">
				{REGISTRY_SOURCES.map((s) => (
					<div
						key={s.label}
						className="flex flex-col items-center gap-1 bg-[var(--ret-bg)]/90 px-2 py-2.5 backdrop-blur-sm"
					>
						<ToolIcon name={s.icon} size={14} className="text-[var(--ret-text-muted)]" />
						<span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--ret-text)]">
							{s.label}
						</span>
					</div>
				))}
			</div>

			{/* Brand logo grid */}
			<div className="grid flex-1 grid-cols-5 gap-px bg-[var(--ret-border)]">
				{REGISTRY_BRANDS.map((b) => (
					<div
						key={b.slug}
						className="flex flex-col items-center justify-center gap-1.5 bg-[var(--ret-bg)]/90 py-3 backdrop-blur-sm transition-colors hover:bg-[var(--ret-bg)]"
					>
						<ServiceIcon slug={b.slug} size={22} tone="color" />
						<span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--ret-text)]">
							{b.name.split(" ")[0]}
						</span>
						<ReticleBadge variant={KIND_BADGE[b.kind]} className="text-[7px]">
							{b.kind}
						</ReticleBadge>
					</div>
				))}
			</div>

			{/* Install flow */}
			<div className="flex items-center justify-between bg-[var(--ret-bg)]/90 px-4 py-3 backdrop-blur-sm">
				<div className="flex items-center gap-2 font-mono text-[9px] text-[var(--ret-text-muted)]">
					<span>search</span>
					<span className="text-[var(--ret-green)]">{"→"}</span>
					<span>add</span>
					<span className="text-[var(--ret-green)]">{"→"}</span>
					<span>config</span>
					<span className="text-[var(--ret-green)]">{"→"}</span>
					<span>install on VM</span>
				</div>
				<span className="font-mono text-[9px] text-[var(--ret-text-muted)]">
					{TRUSTED_ADDONS.length} add-ons
				</span>
			</div>
		</div>
	);
}
