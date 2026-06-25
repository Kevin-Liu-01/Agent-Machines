import type { ReactNode } from "react";

import { BrandMark } from "@/components/BrandMark";
import { cn } from "@/lib/cn";

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
				label: "DCS",
				href: "https://docs.dedaluslabs.ai/dcs",
				external: true,
			},
		],
	},
] as const;

type FooterMark =
	| "e2b"
	| "sprites"
	| "dedalus"
	| "vercel"
	| "hermes"
	| "openclaw"
	| "tools";

const SUBSTRATES: ReadonlyArray<{ label: string; mark: FooterMark }> = [
	{ label: "E2B", mark: "e2b" },
	{ label: "Sprites", mark: "sprites" },
	{ label: "Dedalus", mark: "dedalus" },
	{ label: "Vercel", mark: "vercel" },
];

const AGENTS: ReadonlyArray<{ label: string; href: string; mark: FooterMark }> = [
	{
		label: "Hermes",
		href: "https://github.com/NousResearch/hermes-agent",
		mark: "hermes",
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
					<div className="flex min-h-[220px] flex-col justify-between border-b border-[var(--ret-border)] p-6 md:border-b-0 md:border-r md:p-7">
						<div>
							<BrandMark size={30} gap="tight" withLabel={false} />
							<p className="mt-5 max-w-[24ch] text-[24px] font-semibold leading-[1.05] text-[var(--ret-text)]">
								Run workers. Inspect everything.
							</p>
							<p className="mt-4 max-w-[34ch] text-[13px] leading-relaxed text-[var(--ret-text-dim)]">
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
							className="border-b border-[var(--ret-border)] p-6 md:border-b-0 md:border-r md:p-7 last:md:border-r-0"
						>
							<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
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
				<div className="flex flex-col gap-3 border-x border-t border-[var(--ret-border)] px-6 py-4 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ret-text-muted)] md:flex-row md:items-center md:justify-between md:px-7">
					<span>Copyright 2026 Agent Machines</span>
					<span>MIT . Reticle / Sigil UI</span>
				</div>
				<div className="relative overflow-hidden border-x border-t border-[var(--ret-border)] px-5 pb-6 pt-8">
					<div
						aria-hidden="true"
						className="ret-circuit-texture pointer-events-none absolute inset-0 opacity-[0.08] mix-blend-multiply invert dark:opacity-[0.12] dark:mix-blend-screen dark:invert-0"
					/>
					<div
						className="relative z-10 flex justify-center overflow-visible"
						aria-label="Agent Machines"
					>
						<span
							className="ret-footer-glass-word select-none whitespace-nowrap text-center text-[clamp(48px,12.2vw,178px)] font-semibold leading-[0.82] tracking-normal"
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
			className="group flex min-h-8 items-center justify-between gap-3 border-b border-[var(--ret-border)] pb-2 text-[13px] text-[var(--ret-text-dim)] transition-colors last:border-b-0 hover:text-[var(--ret-text)]"
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
		<div className="border-b border-[var(--ret-border)] p-6 md:border-b-0 md:border-r md:p-7 last:md:border-r-0">
			<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
				{label}
			</p>
			<div className="mt-4 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.12em]">
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

	switch (mark) {
		case "e2b":
			return (
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					className={className}
					fill="none"
				>
					<rect
						x="2.25"
						y="2.75"
						width="11.5"
						height="10.5"
						rx="1.5"
						stroke="currentColor"
						strokeWidth="1.3"
					/>
					<path
						d="M5 6h3.5M5 8h2.5M5 10h4"
						stroke="currentColor"
						strokeLinecap="square"
						strokeWidth="1.15"
					/>
					<rect x="10.25" y="5.5" width="1.75" height="1.75" fill="currentColor" />
				</svg>
			);
		case "sprites":
			return (
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					className={className}
					fill="currentColor"
					fillRule="evenodd"
				>
					<path d="M5 2h6v2h2v2h1v5h-2v2h-1v1H9v-2H7v2H5v-1H4v-2H2V6h1V4h2V2Zm1 4v2h2V6H6Zm4 0v2h2V6h-2Zm-5 4v1h6v-1H5Z" />
				</svg>
			);
		case "dedalus":
			return (
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					className={className}
					fill="none"
				>
					<path
						d="M3 12.5c4.9-1.1 8.2-4.3 9.9-9.1"
						stroke="currentColor"
						strokeLinecap="round"
						strokeWidth="1.45"
					/>
					<path
						d="M5 12.8c3.2-.7 5.8-2.5 7.8-5.2M6.5 9.2h4.8"
						stroke="currentColor"
						strokeLinecap="round"
						strokeWidth="1.15"
					/>
				</svg>
			);
		case "vercel":
			return (
				<svg
					aria-hidden="true"
					viewBox="0 0 74 64"
					className={className}
					fill="currentColor"
				>
					<path d="M37.5896 0.25L74.5396 64.25H0.639648L37.5896 0.25Z" />
				</svg>
			);
		case "hermes":
			return (
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					className={className}
					fill="none"
				>
					<path
						d="M4.4 12.8V7.3c0-2.8 1.65-4.7 4.1-4.7 2.05 0 3.4 1.35 3.4 3.45v6.75"
						stroke="currentColor"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth="1.25"
					/>
					<path
						d="M4.7 7.4c2.25.2 4.2-.55 5.85-2.25M6.3 10.8c1.1.65 2.35.7 3.75.15M11.75 6.15l2.15-.7"
						stroke="currentColor"
						strokeLinecap="round"
						strokeWidth="1.15"
					/>
				</svg>
			);
		case "openclaw":
			return (
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					className={className}
					fill="currentColor"
					fillRule="evenodd"
				>
					<path d="M9.046 7.104a.527.527 0 1 1 0 1.055.527.527 0 0 1 0-1.055Zm6.33 0a.528.528 0 1 1 0 1.056.528.528 0 0 1 0-1.056Z" />
					<path clipRule="evenodd" d="M16.877 1.912c.58-.27 1.14-.323 1.616-.037a.317.317 0 0 1-.326.542c-.227-.136-.547-.153-1.022.068-.352.165-.765.45-1.234.866 2.683 1.17 4.4 3.5 5.148 5.921a6.421 6.421 0 0 0-.704.184c-.578.016-1.174.204-1.502.735-.338.55-.268 1.276.072 2.069l.005.012.007.014c.523 1.045 1.318 1.91 2.2 2.284-.912 3.274-3.44 6.144-5.972 6.988v2.109h-2.11v-2.11c-1.043.417-2.086.01-2.11 0v2.11h-2.11v-2.11c-2.531-.843-5.061-3.713-5.973-6.987.882-.373 1.678-1.238 2.2-2.284l.007-.014.006-.012c.34-.793.41-1.518.071-2.069-.327-.531-.923-.719-1.503-.735a6.409 6.409 0 0 0-.704-.183c.749-2.421 2.466-4.751 5.149-5.922-.47-.416-.88-.701-1.234-.866-.474-.221-.794-.204-1.021-.068a.318.318 0 0 1-.326-.542c.476-.286 1.036-.233 1.615.037.49.229 1.031.628 1.621 1.182A9.924 9.924 0 0 1 12 2.568c1.199 0 2.284.19 3.256.526.59-.554 1.13-.953 1.62-1.182ZM8.835 6.577a1.266 1.266 0 1 0 0 2.532 1.266 1.266 0 0 0 0-2.532Zm6.33 0a1.267 1.267 0 1 0 0 2.533 1.267 1.267 0 0 0 0-2.533Z" />
					<path d="M.395 13.118c-.966-1.932-.163-3.863 2.41-3.365v-.001l.05.01c.084.018.17.038.26.06.033.009.067.017.1.027.084.022.168.048.255.076l.09.027c.528 0 .95.158 1.16.501.212.343.212.87-.105 1.61-.085.17-.178.333-.276.489l-.01.017a4.967 4.967 0 0 1-.62.791l-.019.02c-1.092 1.117-2.496 1.336-3.295-.262Zm20.798-3.365c2.574-.5 3.378 1.433 2.411 3.365-.58 1.159-1.476 1.361-2.342.96l-.011-.005a2.419 2.419 0 0 1-.114-.056l-.019-.01a2.751 2.751 0 0 1-.115-.067l-.023-.014c-.035-.022-.071-.044-.106-.068l-.05-.035c-.55-.388-1.062-1.007-1.44-1.76-.276-.647-.311-1.132-.174-1.472.176-.439.636-.639 1.23-.639.032-.011.066-.02.099-.03.08-.026.16-.05.238-.072l.117-.03c.101-.023.2-.04.3-.067Z" />
				</svg>
			);
		case "tools":
			return (
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					className={className}
					fill="none"
				>
					<rect
						x="2.5"
						y="3"
						width="11"
						height="10"
						rx="1.25"
						stroke="currentColor"
						strokeWidth="1.25"
					/>
					<path
						d="m5.1 6.1 1.9 1.9-1.9 1.9M8.6 10h2.4"
						stroke="currentColor"
						strokeLinecap="square"
						strokeLinejoin="round"
						strokeWidth="1.25"
					/>
				</svg>
			);
	}
}
