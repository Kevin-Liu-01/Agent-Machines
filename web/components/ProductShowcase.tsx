import { Expand, Fingerprint } from "@/components/ui/icons";
import Image from "next/image";
import type { ReactNode } from "react";

import { Logo, type Mark } from "@/components/Logo";
import { PublicIcon } from "@/components/marketing/PublicIcon";
import { ServiceIcon, type ServiceSlug } from "@/components/ServiceIcon";
import { cn } from "@/lib/cn";
import { LANDING_BODY, LANDING_EYEBROW, LANDING_INSET, LANDING_SECTION_SPACE, LANDING_SPLIT, LANDING_TITLE } from "@/lib/marketing/layout";
import type { PublicIconName } from "@/lib/marketing/public-site";

const PROVIDERS = [
	{ icon: "e2b" as const, label: "E2B" },
	{ icon: "sprites" as const, label: "Sprites" },
	{ icon: "daytona" as const, label: "Daytona" },
	{ icon: "vercel" as const, label: "Vercel" },
];

const STAGES = [
	{ id: "showcase-setup", label: "Configure", icon: "bot" },
	{ id: "showcase-agents", label: "Run", icon: "terminal" },
	{ id: "showcase-fleet", label: "Inspect", icon: "layers" },
] as const;

type ProductScreen = {
	src: string;
	label: string;
	caption: string;
	alt: string;
	icon?: PublicIconName;
	runtime?: Mark;
	provider?: ServiceSlug;
};

const SETUP_SCREENS: readonly ProductScreen[] = [
	{
		src: "/screenshots/dashboard-worker-configure.png",
		label: "Worker configuration",
		caption: "A specialist, an agent, and a place to run.",
		alt: "Worker configuration dialog with a name, runtime, and specialist recipe",
		icon: "bot",
	},
	{
		src: "/screenshots/dashboard-provider-routing.png",
		label: "Provider routing",
		caption: "Primary and backup providers. This older capture includes retired Dedalus; current providers appear below.",
		alt: "Earlier provider-routing screen with primary and backup choices, including the now-retired Dedalus provider",
		icon: "route",
	},
];

const AGENT_SCREENS: readonly ProductScreen[] = [
	{
		src: "/screenshots/dashboard-conversation-claude.png",
		label: "Claude Code on Sprites",
		caption: "Conversation, terminal, and logs in one workspace.",
		alt: "Claude Code answering a question inside an Agent Machines Worker console on Sprites",
		runtime: "claudecode",
		provider: "sprites",
	},
	{
		src: "/screenshots/dashboard-conversation-openclaw.png",
		label: "OpenClaw on E2B",
		caption: "The selected model and stored context, in the session.",
		alt: "OpenClaw answering a question about its runtime and persistent state inside an E2B Worker",
		runtime: "openclaw",
		provider: "e2b",
	},
	{
		src: "/screenshots/console-hermes.png",
		label: "Hermes console",
		caption: "The native agent, inside your browser.",
		alt: "Hermes running in the Agent Machines browser console",
		runtime: "nous",
	},
	{
		src: "/screenshots/console-codex.png",
		label: "Codex CLI console",
		caption: "Your project and terminal, attached to the Worker.",
		alt: "Codex CLI running in the Agent Machines browser terminal",
		runtime: "codex",
	},
];

const FLEET_SCREEN: ProductScreen = {
	src: "/screenshots/dashboard-live-fleet.png",
	label: "Fleet overview",
	caption: "Providers, models, health, and controls—with sessions, logs, and artifacts one step away.",
	alt: "Agent Machines fleet showing Codex and Claude Code Workers and their machine controls",
	icon: "layers",
};

const SCREEN_LINK = cn(
	"group flex min-w-0 border border-[var(--ret-border)]/30 bg-[var(--ret-bg-soft)]/20",
	"hover:border-[var(--ret-border-hover)] focus-visible:border-[var(--ret-purple)]",
	"focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ret-purple)]",
	"motion-safe:transition-[border-color] motion-safe:duration-150 motion-safe:[transition-timing-function:var(--ret-ease-out)] focus-visible:transition-none",
);

export function ProductShowcase() {
	return (
		<section id="product-showcase" aria-labelledby="product-showcase-heading" className={cn(LANDING_INSET, LANDING_SECTION_SPACE, "bg-[var(--ret-bg)]")}>
			<header data-landing-header className={cn(LANDING_SPLIT, "items-end border-b border-[var(--ret-border)]/25 pb-8")}>
				<div>
					<p className={cn(LANDING_EYEBROW)}><PublicIcon name="layers" className={cn("size-4")} />Inside the product</p>
					<h2 id="product-showcase-heading" className={cn(LANDING_TITLE, "max-w-[20ch]")}>
						Configure. Run. Inspect.
					</h2>
				</div>
				<div>
					<p className={cn(LANDING_BODY, "max-w-[48ch]")}>Follow a Worker from its first configuration to the sessions, files, and activity you can inspect.</p>
					<nav aria-label="Product walkthrough" className={cn("flex flex-wrap gap-x-6 gap-y-2")}>
						{STAGES.map((stage) => (
							<a
								key={stage.id}
								href={`#${stage.id}`}
								className={cn("flex min-h-11 items-center gap-2 text-base text-[var(--ret-text-dim)] hover:text-[var(--ret-text)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ret-purple)]")}
							>
								<PublicIcon name={stage.icon} className={cn("h-5 w-5 shrink-0")} />
								{stage.label}
							</a>
						))}
					</nav>
					<p className={cn("mt-2 max-w-[48ch] text-sm leading-6 text-[var(--ret-text-muted)]")}>
						Recorded product views, not live status. Versions may differ.
					</p>
				</div>
			</header>

			<WalkthroughSection stage={STAGES[0]}>
				<div className={cn("grid items-stretch gap-6 md:grid-cols-2 lg:gap-10 xl:gap-12")}>
					{SETUP_SCREENS.map((screen) => <EvidenceScreen key={screen.src} screen={screen} />)}
				</div>
			</WalkthroughSection>

			<WalkthroughSection stage={STAGES[1]}>
				<div className={cn("grid items-stretch gap-6 md:grid-cols-2 lg:gap-10 xl:gap-12")}>
					{AGENT_SCREENS.map((screen) => <EvidenceScreen key={screen.src} screen={screen} />)}
				</div>
			</WalkthroughSection>

			<WalkthroughSection stage={STAGES[2]}>
				<EvidenceScreen screen={FLEET_SCREEN} sizes="100vw" wide />
			</WalkthroughSection>

			<footer className={cn("flex flex-col gap-5 border-t border-[var(--ret-border)]/25 pt-6")}>
				<div className={cn("flex flex-wrap items-center gap-x-6 gap-y-3")}>
					<span className={cn("text-sm text-[var(--ret-text-muted)]")}>Current providers</span>
					<ul className={cn("flex flex-wrap gap-x-5 gap-y-3")}>
						{PROVIDERS.map((provider) => (
							<li key={provider.label} className={cn("flex items-center gap-2 text-sm text-[var(--ret-text)]")}>
								<ServiceIcon slug={provider.icon} size={20} />
								{provider.label}
							</li>
						))}
					</ul>
				</div>
				<p className={cn("flex items-start gap-2 text-sm leading-6 text-[var(--ret-text-muted)]")}>
					<Fingerprint className={cn("mt-0.5 h-5 w-5 shrink-0")} aria-hidden="true" />
					Migration moves saved state—not running processes or RAM.
				</p>
			</footer>
		</section>
	);
}

function WalkthroughSection({
	stage,
	children,
}: {
	stage: (typeof STAGES)[number];
	children: ReactNode;
}) {
	return (
		<section aria-labelledby={stage.id} className={cn("py-7 md:py-9")}>
			<h3 id={stage.id} className={cn("mb-4 flex scroll-mt-24 items-center gap-2 text-xl font-semibold tracking-tight text-[var(--ret-text)]")}>
				<PublicIcon name={stage.icon} className={cn("h-5 w-5 shrink-0 text-[var(--ret-text-muted)]")} />
				{stage.label}
			</h3>
			{children}
		</section>
	);
}

function EvidenceScreen({ screen, sizes = "(min-width: 768px) 50vw, 100vw", wide = false }: { screen: ProductScreen; sizes?: string; wide?: boolean }) {
	return (
		<a
			href={screen.src}
			target="_blank"
			rel="noopener noreferrer"
			aria-label={`${screen.label}: view full-size screenshot (opens in a new tab)`}
			className={SCREEN_LINK}
		>
			<figure className={cn("flex min-w-0 flex-1 flex-col")}>
				<div className={cn("relative w-full border-b border-[var(--ret-border)]/25 bg-[var(--ret-bg-soft)]", wide ? "aspect-[16/9]" : "aspect-[3/2]")}>
					<Image src={screen.src} fill alt={screen.alt} className={cn("object-contain")} sizes={sizes} />
				</div>
				<figcaption className={cn("flex flex-1 flex-col px-4 py-4 sm:px-5")}>
					<div className={cn("flex items-center gap-3")}>
						<span className={cn("flex h-6 w-6 shrink-0 items-center justify-center text-[var(--ret-text)]")}>
							{screen.runtime ? (
								<Logo mark={screen.runtime} size={24} tone={screen.runtime === "codex" ? "auto" : "native"} />
							) : (
								<PublicIcon name={screen.icon ?? "file"} className={cn("h-5 w-5 text-[var(--ret-text-muted)]")} />
							)}
						</span>
						<h4 className={cn("min-w-0 flex-1 text-lg font-semibold tracking-tight text-[var(--ret-text)]")}>{screen.label}</h4>
						{screen.provider ? <span className={cn("shrink-0 text-[var(--ret-text-dim)]")}><ServiceIcon slug={screen.provider} size={20} /></span> : null}
						<Expand className={cn("h-5 w-5 shrink-0 text-[var(--ret-text-muted)] group-hover:text-[var(--ret-text)]")} aria-hidden="true" />
						<span className={cn("sr-only")}>View full size</span>
					</div>
					<p className={cn("mt-2 max-w-[75ch] text-base leading-7 text-[var(--ret-text-dim)]")}>{screen.caption}</p>
				</figcaption>
			</figure>
		</a>
	);
}
