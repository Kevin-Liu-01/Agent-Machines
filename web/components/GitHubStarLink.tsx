import { cn } from "@/lib/cn";

import { ServiceIcon } from "./ServiceIcon";

/**
 * Async server component that renders a "github -> star count" pill
 * in the public navbar. Fetches `/repos/<owner>/<repo>` once per hour
 * (Next revalidate cache) and falls back to a star-icon-only link if
 * the API is rate-limited or unreachable.
 *
 * Caller controls the repo via the `repo` prop: "owner/name".
 */

type Props = {
	repo: string;
	className?: string;
};

async function fetchStars(repo: string): Promise<number | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 1800);
	try {
		const response = await fetch(`https://api.github.com/repos/${repo}`, {
			headers: {
				Accept: "application/vnd.github+json",
				"User-Agent": "agent-machines-web",
			},
			signal: controller.signal,
			next: { revalidate: 3600 },
		});
		if (!response.ok) return null;
		const body = (await response.json()) as { stargazers_count?: unknown };
		return typeof body.stargazers_count === "number"
			? body.stargazers_count
			: null;
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

function formatStars(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
	return n.toString();
}

function StarIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="currentColor"
			className={cn("inline-block", className)}
			aria-hidden="true"
		>
			<path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z" />
		</svg>
	);
}

export async function GitHubStarLink({ repo, className }: Props) {
	const stars = await fetchStars(repo);
	const display = stars !== null ? formatStars(stars) : null;
	return (
		<a
			href={`https://github.com/${repo}`}
			target="_blank"
			rel="noreferrer"
			title={
				stars !== null ? `${stars.toLocaleString()} stars on GitHub` : "GitHub"
			}
			className={cn(
				"ret-nav-trigger group inline-flex h-8 items-center gap-1.5 border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] px-2.5 text-[12px] font-medium text-[var(--ret-text-dim)] transition-colors hover:border-[var(--ret-border-hover)] hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)]",
				className,
			)}
		>
			<ServiceIcon slug="github" size={12} tone="mono" />
			<span className="hidden text-[var(--ret-text-secondary)] lg:inline">GitHub</span>
			{display ? (
				<>
					<span className="h-3 w-px bg-[var(--ret-border)]" aria-hidden="true" />
					<StarIcon className="h-3 w-3 text-[var(--ret-text-muted)] transition-transform group-hover:scale-110" />
					<span className="tabular-nums">{display}</span>
				</>
			) : null}
		</a>
	);
}
