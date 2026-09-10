import type { ReactNode } from "react";

import { BrandMark } from "@/components/BrandMark";
import { Logo, type Mark } from "@/components/Logo";
import { SquareTerminal } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { LANDING_INSET } from "@/lib/marketing/layout";

const FOOTER_GROUPS = [
	{
		label: "Product",
		links: [
			{ label: "Product", href: "/product" },
			{ label: "Agents", href: "/agents" },
			{ label: "Pricing", href: "/pricing" },
			{ label: "Registry", href: "/registry" },
		],
	},
	{
		label: "Resources",
		links: [
			{ label: "Docs", href: "/docs" },
			{ label: "Blog", href: "/blog" },
			{ label: "FAQ", href: "/faq" },
			{
				label: "GitHub",
				href: "https://github.com/Kevin-Liu-01/agent-machines",
				external: true,
			},
		],
	},
	{
		label: "Legal",
		links: [
			{ label: "Terms", href: "/terms" },
			{ label: "Privacy", href: "/privacy" },
			{
				label: "Hermes docs",
				href: "https://hermes-agent.nousresearch.com/docs/",
				external: true,
			},
			{
				label: "Daytona docs",
				href: "https://www.daytona.io/docs/",
				external: true,
			},
		],
	},
] as const;

type FooterMark = Mark | "tools";

const SUBSTRATES: ReadonlyArray<{ label: string; mark: FooterMark }> = [
	{ label: "E2B", mark: "e2b" },
	{ label: "Sprites", mark: "sprites" },
	{ label: "Daytona", mark: "daytona" },
	{ label: "Vercel", mark: "vercel" },
];

const AGENTS: ReadonlyArray<{ label: string; href: string; mark: FooterMark }> = [
	{
		label: "Hermes",
		href: "https://github.com/NousResearch/hermes-agent",
		mark: "nous",
	},
	{
		label: "OpenClaw",
		href: "https://github.com/openclaw/openclaw",
		mark: "openclaw",
	},
];

export function Footer() {
	return (
		<footer className="relative border-t border-[var(--ret-border)] bg-[var(--ret-bg)] text-xs text-[var(--ret-text-muted)]">
			<div className="mx-auto w-full max-w-[var(--ret-content-max)]">
				<div className="grid border-x border-[var(--ret-border)] md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
					<div className={cn(LANDING_INSET, "flex min-h-[220px] flex-col justify-between border-b border-[var(--ret-border)] py-8 md:border-b-0 md:border-r")}>
						<div>
							<BrandMark size={30} gap="tight" withLabel={false} />
							<p className="mt-5 max-w-[24ch] text-[24px] font-semibold leading-[1.05] text-[var(--ret-text)]">
								Run workers. Inspect everything.
							</p>
							<p className={cn("mt-4 max-w-[34ch] text-sm leading-6 text-[var(--ret-text-dim)]")}>
								Run the runtime. Read logs. Track usage.
								Keep tools and artifacts visible.
							</p>
						</div>
						<a
							href="https://kevin-liu.tech"
							target="_blank"
							rel="noreferrer"
							className="mt-8 inline-flex w-fit items-center border border-[var(--ret-border)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ret-text-dim)] transition-colors hover:border-[var(--ret-border-strong)] hover:text-[var(--ret-text)]"
						>
							Kevin Liu
						</a>
					</div>
					{FOOTER_GROUPS.map((group) => (
						<div
							key={group.label}
							className={cn(LANDING_INSET, "border-b border-[var(--ret-border)] py-8 md:border-b-0 md:border-r last:md:border-r-0")}
						>
							<p className={cn("text-sm font-medium text-[var(--ret-text-muted)]")}>
								{group.label}
							</p>
							<nav className="mt-5 grid gap-3" aria-label={group.label}>
								{group.links.map((link) => (
									<FooterLink key={link.label} {...link} />
								))}
							</nav>
						</div>
					))}
				</div>
				<div className="grid border-x border-t border-[var(--ret-border)] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
					<StackBlock label="Substrates">
						{SUBSTRATES.map((item) => (
							<FooterBadge key={item.label} label={item.label} mark={item.mark} />
						))}
					</StackBlock>
					<StackBlock label="Agents">
						{AGENTS.map((agent) => (
							<FooterBadge
								key={agent.label}
								href={agent.href}
								label={agent.label}
								mark={agent.mark}
							/>
						))}
						<FooterBadge label="Tools" mark="tools" muted />
					</StackBlock>
				</div>
				<div className={cn(LANDING_INSET, "flex flex-col gap-3 border-x border-t border-[var(--ret-border)] py-5 text-sm text-[var(--ret-text-muted)] md:flex-row md:items-center md:justify-between")}>
					<span>Copyright 2026 Agent Machines</span>
					<span>MIT · Reticle / Sigil UI</span>
				</div>
				<div className="relative overflow-hidden border-x border-t border-[var(--ret-border)] px-5 pb-12 pt-9 md:pb-14">
					<div
						aria-hidden="true"
						className="ret-circuit-texture-footer pointer-events-none absolute inset-0 opacity-[0.08] mix-blend-multiply invert dark:opacity-[0.12] dark:mix-blend-screen dark:invert-0"
					/>
					<div
						className="relative z-10 flex justify-center overflow-visible"
						aria-label="Agent Machines"
						role="img"
					>
						<span
							className="ret-footer-glass-word select-none whitespace-nowrap text-center text-[clamp(48px,12.2vw,178px)] font-semibold leading-[0.96] tracking-normal"
							data-text="agent machines"
						>
							agent machines
						</span>
					</div>
				</div>
			</div>
		</footer>
	);
}

function FooterLink({
	label,
	href,
	external,
}: {
	label: string;
	href: string;
	external?: boolean;
}) {
	return (
		<a
			href={href}
			target={external ? "_blank" : undefined}
			rel={external ? "noreferrer" : undefined}
			className={cn("group flex min-h-9 items-center justify-between gap-3 border-b border-[var(--ret-border)]/40 pb-2 text-sm text-[var(--ret-text-dim)] transition-colors duration-150 last:border-b-0 hover:text-[var(--ret-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-text)] motion-reduce:transition-none")}
		>
			<span>{label}</span>
			<span
				className="font-mono text-[10px] text-[var(--ret-text-muted)] transition-transform duration-[var(--ret-duration-hover)] group-hover:translate-x-0.5"
				aria-hidden="true"
			>
				/
			</span>
		</a>
	);
}

function StackBlock({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className={cn(LANDING_INSET, "border-b border-[var(--ret-border)] py-6 md:border-b-0 md:border-r last:md:border-r-0")}>
			<p className={cn("text-sm font-medium text-[var(--ret-text-muted)]")}>
				{label}
			</p>
			<div className={cn("mt-4 flex flex-wrap gap-2 text-sm")}>
				{children}
			</div>
		</div>
	);
}

function FooterBadge({
	label,
	mark,
	href,
	muted,
}: {
	label: string;
	mark: FooterMark;
	href?: string;
	muted?: boolean;
}) {
	const className = cn(
		"group inline-flex min-h-9 items-center gap-2 border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-3 py-2 text-[var(--ret-text-secondary)] transition-colors duration-[var(--ret-duration-hover)]",
		"hover:border-[var(--ret-border-strong)] hover:text-[var(--ret-text)]",
		muted && "text-[var(--ret-text-muted)] hover:text-[var(--ret-text-dim)]",
	);
	const content = (
		<>
			<FooterBadgeMark mark={mark} />
			<span>{label}</span>
		</>
	);

	if (href) {
		return (
			<a href={href} target="_blank" rel="noreferrer" className={className}>
				{content}
			</a>
		);
	}

	return <span className={className}>{content}</span>;
}

function FooterBadgeMark({ mark }: { mark: FooterMark }) {
	const className =
		"h-4 w-4 shrink-0 text-[var(--ret-text-secondary)] transition-colors duration-[var(--ret-duration-hover)] group-hover:text-[var(--ret-text)]";

	if (mark !== "tools") {
		return (
			<Logo
				mark={mark}
				size={18}
				tone={mark === "vercel" ? "currentColor" : "native"}
				className="shrink-0"
			/>
		);
	}

	switch (mark) {
		case "tools":
			return <SquareTerminal aria-hidden="true" className={className} />;
	}
}
