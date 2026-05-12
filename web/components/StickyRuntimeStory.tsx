import { Logo } from "@/components/Logo";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { WingBackground } from "@/components/WingBackground";

const STAGES = [
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
		title: "Hermes or OpenClaw installs into the same durable boundary.",
		body: "Hermes gets memory, crons, sessions, MCP. OpenClaw gets browser, screenshot, shell, vision. Both expose a gateway and persist runtime state under /home/machine.",
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
] as const;

export function StickyRuntimeStory() {
	return (
		<section className="grid gap-px border border-[var(--ret-border)] bg-[var(--ret-border)] lg:grid-cols-[0.72fr_1.28fr]">
			<div className="bg-[var(--ret-bg)] p-4 lg:sticky lg:top-[92px] lg:h-[calc(100dvh-120px)]">
				<ReticleLabel>SCROLL RUNTIME</ReticleLabel>
				<h2 className="ret-display mt-3 max-w-[13ch] text-3xl md:text-4xl">
					Watch the agent machine assemble.
				</h2>
				<p className="mt-4 max-w-[50ch] text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
					This section behaves like a locked product diagram: the copy stays
					stable while each workflow panel slides into place as you scroll.
					No fake dashboard screenshots, just the actual account {"->"} provider
					{"->"} agent {"->"} storage model.
				</p>
				<div className="mt-6 grid gap-px border border-[var(--ret-border)] bg-[var(--ret-border)]">
					{["settings", "provider", "agent", "data"].map((item, index) => (
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
	stage: (typeof STAGES)[number];
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
					<div className="mt-6 flex items-center gap-2">
						<Logo mark={index === 2 ? "openclaw" : "dedalus"} size={18} />
						{index === 2 ? <Logo mark="nous" size={18} /> : null}
						<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							persistent agent lane
						</span>
					</div>
				</div>
				<div className="ret-material-field relative min-h-[360px]">
					<WingBackground
						variant={index % 2 === 0 ? "nyx-waves" : "nyx-lines"}
						opacity={{ light: 0.28, dark: 0.48 }}
						fadeEdges
					/>
					<div className="relative z-10 grid h-full grid-cols-[1.08fr_0.92fr] gap-px bg-[var(--ret-border)] p-px">
						<div className="grid gap-px bg-[var(--ret-border)]">
						{stage.nodes.map((node, nodeIndex) => (
							<div
								key={node}
								className="relative flex items-center justify-between bg-[var(--ret-bg)]/90 px-4 backdrop-blur-sm"
							>
								<div>
									<p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
										{String(index + 1)}.{String(nodeIndex + 1)}
									</p>
									<p className="mt-1 text-[18px] font-medium tracking-tight text-[var(--ret-text)]">
										{node}
									</p>
								</div>
								<div
									className="h-10 w-10 border border-[var(--ret-border)]"
									style={{ background: stage.accent }}
									aria-hidden="true"
								/>
								{nodeIndex < stage.nodes.length - 1 ? (
									<span
										className="absolute bottom-[-1px] left-8 h-px w-[calc(100%-4rem)]"
										style={{ background: stage.accent }}
									/>
								) : null}
							</div>
						))}
						</div>
						<div className="relative overflow-hidden bg-[var(--ret-bg)]/88 p-4 backdrop-blur-sm">
							<div className="absolute inset-x-4 top-4 border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-3">
								<p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
									zoom-in
								</p>
								<p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ret-text)]">
									{stage.nodes[1]}
								</p>
							</div>
							<div className="absolute inset-x-8 top-[38%] h-px bg-[var(--ret-purple)]" />
							<div className="absolute bottom-4 left-4 right-4 grid grid-cols-3 gap-px bg-[var(--ret-border)]">
								{stage.nodes.map((node) => (
									<div key={node} className="bg-[var(--ret-bg-soft)] px-2 py-3 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">
										{node.slice(0, 6)}
									</div>
								))}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
