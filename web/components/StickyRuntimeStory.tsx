import { Logo } from "@/components/Logo";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { ServiceIcon } from "@/components/ServiceIcon";
import { WireframeMachine } from "@/components/three";

type Stage = {
	kicker: string;
	title: string;
	body: string;
	nodes: readonly string[];
	/** Circuit-art schematic slug shown as the stage's right-panel hero. */
	art: string;
};

const STAGES: ReadonlyArray<Stage> = [
	{
		kicker: "stage 01",
		title: "Account settings become a machine recipe.",
		body: "Provider, agent, gateway, env, tools, and custom loadout are not onboarding-only values. They are durable account objects that every new machine can inherit.",
		nodes: ["account", "profiles", "bootstrap"],
		art: "settings",
	},
	{
		kicker: "stage 02",
		title: "The runtime router chooses the host shape.",
		body: "E2B, Sprites.dev, Dedalus Machines, and Vercel Sandbox are substrate routes behind one provider interface. The UI exposes lifecycle actions only when that lane supports them.",
		nodes: ["provider", "capability", "host"],
		art: "machines",
	},
	{
		kicker: "stage 03",
		title: "Four agents install into the same durable boundary.",
		body: "Hermes, OpenClaw, Claude Code, and Codex install into the same runtime root. Gateway agents and CLI agents use different launch paths, but share machine state.",
		nodes: ["agent", "gateway", "disk"],
		art: "agents",
	},
	{
		kicker: "stage 04",
		title: "The dashboard reads the same system the agent writes.",
		body: "Chats, artifacts, logs, terminal snapshots, sessions, usage, and settings all converge on the same storage and provider execution model.",
		nodes: ["chat", "artifacts", "observability"],
		art: "overview",
	},
	{
		kicker: "stage 05",
		title: "Browse and install from six live registries.",
		body: "skills.sh, the MCP server registry, npm, Cursor plugins, GitHub repos, and URL manifests are searchable from Registry. Add entries to loadout, then sync on deploy or reload.",
		nodes: ["skills", "mcps", "tools"],
		art: "registry",
	},
];

export function StickyRuntimeStory() {
	return (
		<section className="mx-auto grid w-full max-w-[var(--ret-content-max)] gap-px bg-[var(--ret-border)] lg:grid-cols-[0.72fr_1.28fr]">
			<div className="bg-[var(--ret-bg)]">
				<div className="flex flex-col p-4 lg:sticky lg:top-[92px] lg:h-[calc(100dvh-120px)]">
					<ReticleLabel>SCROLL RUNTIME</ReticleLabel>
					<h2 className="ret-display mt-3 max-w-[13ch] text-3xl md:text-4xl">
						Watch the agent machine assemble.
					</h2>
					<p className="mt-4 max-w-[50ch] text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
						Account settings become a machine recipe. The provider creates the
						host, the runtime installs the agent, the loadout defines its tools,
						and observability proves what is running.
					</p>
					<ReticleFrame className="mt-6" corners={false}>
						<div className="grid gap-px bg-[var(--ret-border)]">
							{["settings", "provider", "agent", "data", "registry"].map((item, index) => (
								<div key={item} className="flex items-center justify-between bg-[var(--ret-bg-soft)] px-3 py-2">
									<span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
										{item}
									</span>
									<span className="text-[10px] text-[var(--ret-text)]">
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

				{/* Art-forward right panel: themed circuit schematic as the hero */}
				<div className="relative min-h-[360px] overflow-hidden bg-[#0a0a0a]">
					{/* eslint-disable-next-line @next/next/no-img-element -- local white-on-black stage schematic, the panel's hero visual */}
					<img
						src={`/category-art/${stage.art}.png`}
						alt=""
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover opacity-90"
					/>
					<div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-1.5 border-t border-white/[0.08] bg-black/55 px-4 py-3 backdrop-blur-sm">
						{stage.nodes.map((node) => (
							<span
								key={node}
								className="border border-white/[0.14] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/55"
							>
								{node}
							</span>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

function StageMeta({ index }: { index: number }) {
	if (index === 1) {
		return (
			<div className="mt-6 flex flex-wrap items-center gap-2">
				<ServiceIcon slug="e2b" size={16} tone="color" />
				<ServiceIcon slug="sprites" size={16} tone="color" />
				<Logo mark="dedalus" size={16} />
				<ServiceIcon slug="vercel" size={16} />
				<span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					four substrate lanes
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
				<span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
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
					className="inline-flex items-center gap-2 border border-[var(--ret-accent)]/40 bg-[var(--ret-purple-glow)] px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-[var(--ret-accent)] transition-colors hover:bg-[var(--ret-accent)]/15"
				>
					open registry
				</a>
			</div>
		);
	}
	return (
		<div className="mt-6 flex items-center gap-2">
			<Logo mark={index === 0 ? "am" : "agent"} size={18} />
			<span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				control plane route
			</span>
		</div>
	);
}
