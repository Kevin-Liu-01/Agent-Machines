import { UserButton } from "@clerk/nextjs";
import type { SVGProps } from "react";

import { SignedIn, SignedOut } from "@/components/AuthSwitch";
import { BrandMark } from "@/components/BrandMark";
import { GitHubStarLink } from "@/components/GitHubStarLink";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleNavbar } from "@/components/reticle/ReticleNavbar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/cn";

const CLERK_READY = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

type NavItem = {
	href: string;
	label: string;
	icon: (props: SVGProps<SVGSVGElement>) => React.ReactElement;
};

/**
 * Public site navbar -- rendered on the landing and any other
 * unauthenticated marketing surfaces. Tier order:
 *
 *   brand mark + serif wordmark
 *   /
 *   icon-prefixed section anchors (features / live / tools / ui /
 *   skills / stack)
 *   /
 *   github-stars pill (live API), theme toggle, sign-in CTA
 *
 * The serif wordmark is the only place we use the
 * `var(--font-display-serif)` (Instrument Serif italic) -- everywhere
 * else stays on Nacelle (sans) or the mono stack, so the wordmark
 * carries the identity without bleeding into body copy.
 */

export async function PublicNavbar({
	githubRepo,
}: {
	githubRepo: string;
}) {
	const items: ReadonlyArray<NavItem> = [
		{ href: "/#capabilities", label: "features", icon: IconFeatures },
		{ href: "/#runtime", label: "live", icon: IconLive },
		{ href: "/#loadout", label: "tools", icon: IconTools },
		{ href: "/registry", label: "registry", icon: IconTools },
		{ href: "/#skills", label: "skills", icon: IconSkills },
		{ href: "/#architecture", label: "stack", icon: IconStack },
		{ href: "/faq", label: "faq", icon: IconFaq },
	];
	return (
		<ReticleNavbar>
			<div className="flex h-12 items-center justify-between gap-4 px-5">
				<a href="/" className="group flex items-center gap-2.5">
					<BrandMark size={20} withLabel={false} />
					<span
						className="text-[20px] leading-none tracking-tight text-[var(--ret-text)] transition-colors group-hover:text-[var(--ret-purple)]"
						style={{ fontFamily: "var(--font-display-serif)" }}
					>
						agent-machines
					</span>
				</a>
				<nav
					aria-label="Sections"
					className="hidden items-center gap-px overflow-hidden border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] md:flex"
				>
					{items.map((item) => {
						const Icon = item.icon;
						return (
							<a
								key={item.href}
								href={item.href}
								className={cn(
									"flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-[var(--ret-text-dim)] transition-colors",
									"hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)]",
								)}
							>
								<Icon className="h-3 w-3 text-[var(--ret-text-muted)]" />
								<span>{item.label}</span>
							</a>
						);
					})}
				</nav>
				<div className="flex items-center gap-2">
					<GitHubStarLink repo={githubRepo} className="hidden md:flex" />
					<ThemeToggle />
					<SignedIn>
						<ReticleButton as="a" href="/dashboard" variant="primary" size="sm">
							Dashboard
						</ReticleButton>
						{CLERK_READY ? (
							<UserButton
								appearance={{ elements: { avatarBox: "h-6 w-6" } }}
							/>
						) : null}
					</SignedIn>
					<SignedOut>
						<ReticleButton as="a" href="/sign-in" variant="primary" size="sm">
							Sign in
						</ReticleButton>
					</SignedOut>
				</div>
			</div>
		</ReticleNavbar>
	);
}

/* ------------------------------------------------------------------ */
/* Inline section icons -- Lucide-shaped, currentColor                 */
/* ------------------------------------------------------------------ */

function IconFeatures(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<rect x="2" y="2" width="5" height="5" />
			<rect x="9" y="2" width="5" height="5" />
			<rect x="2" y="9" width="5" height="5" />
			<rect x="9" y="9" width="5" height="5" />
		</svg>
	);
}

function IconLive(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M2 8h2.5l1.5-4 3 8 1.5-4H14" />
		</svg>
	);
}

function IconTools(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M9 4l3 3-7 7H2v-3l7-7z" />
			<path d="M11 2l3 3" />
		</svg>
	);
}

function IconUi(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<rect x="2" y="2.5" width="12" height="11" />
			<path d="M2 6h12M6 6v8" />
		</svg>
	);
}

function IconSkills(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M3 3h7l3 3v7H3z" />
			<path d="M5 6h6M5 8.5h6M5 11h4" />
		</svg>
	);
}

function IconStack(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M8 2L2 5l6 3 6-3z" />
			<path d="M2 11l6 3 6-3" />
			<path d="M2 8l6 3 6-3" />
		</svg>
	);
}

function IconFaq(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M5.5 6a2.5 2.5 0 1 1 4 2c-.7.5-1 1-1 2" />
			<line x1="8.5" y1="12.5" x2="8.5" y2="12.5" />
			<rect x="2" y="2" width="12" height="12" rx="0" />
		</svg>
	);
}
