import { UserButton } from "@clerk/nextjs";

import { SignedIn, SignedOut } from "@/components/AuthSwitch";
import { BrandHomeLockup } from "@/components/BrandHomeLockup";
import { GitHubStarLink } from "@/components/GitHubStarLink";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleNavbar } from "@/components/reticle/ReticleNavbar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/cn";

const CLERK_READY = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

type NavItem = {
	href: string;
	label: string;
};

/**
 * Public site navbar — landing and other marketing surfaces.
 * Serif wordmark for brand; everything else stays on Nacelle sans.
 */
export async function PublicNavbar({
	githubRepo,
}: {
	githubRepo: string;
}) {
	const items: ReadonlyArray<NavItem> = [
		{ href: "/#capabilities", label: "Features" },
		{ href: "/#runtime", label: "Live" },
		{ href: "/#loadout", label: "Tools" },
		{ href: "/registry", label: "Registry" },
		{ href: "/#skills", label: "Skills" },
		{ href: "/#architecture", label: "Stack" },
		{ href: "/faq", label: "FAQ" },
	];

	return (
		<ReticleNavbar>
			<div className="grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-5 md:px-6">
				<BrandHomeLockup density="navbar" className="min-w-0" />

				<nav
					aria-label="Sections"
					className="hidden items-center justify-center gap-0.5 md:flex"
				>
					{items.map((item) => (
						<a
							key={item.href}
							href={item.href}
							className={cn(
								"whitespace-nowrap rounded-sm px-2.5 py-1.5 text-[13px] font-medium tracking-[-0.01em] text-[var(--ret-text-dim)] transition-colors",
								"hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)]",
							)}
						>
							{item.label}
						</a>
					))}
				</nav>

				<div className="flex items-center justify-end gap-2">
					<GitHubStarLink repo={githubRepo} className="hidden md:flex" />
					<ThemeToggle className="h-8" />
					<SignedIn>
						<ReticleButton as="a" href="/dashboard" variant="primary" size="sm">
							Dashboard
						</ReticleButton>
						{CLERK_READY ? (
							<UserButton
								appearance={{ elements: { avatarBox: "h-7 w-7" } }}
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
