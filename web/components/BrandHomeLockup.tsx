import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";
import { cn } from "@/lib/cn";

type Props = {
	href?: string;
	/** Mark + partner carousel scale. Sidebar uses 16; navbar uses 20. */
	markSize?: number;
	/** Serif wordmark size preset. */
	density?: "sidebar" | "navbar";
	className?: string;
};

const WORDMARK_CLASS = {
	sidebar:
		"text-[16px] leading-none tracking-tight whitespace-nowrap [text-box-trim:both] [text-box-edge:cap_alphabetic]",
	navbar:
		"text-[18px] md:text-[20px] leading-none tracking-tight whitespace-nowrap",
} as const;

/**
 * Home link lockup: animated mark × partner + one-line serif wordmark.
 * `density="sidebar"` keeps copy on a single row inside the 220px rail.
 */
export function BrandHomeLockup({
	href = "/",
	markSize,
	density = "navbar",
	className,
}: Props) {
	const size = markSize ?? (density === "sidebar" ? 18 : 20);
	const body = (
		<>
			<BrandMark
				size={size}
				gap="tight"
				withLabel={false}
				intro={density === "navbar"}
				className="shrink-0"
			/>
			<span
				className={cn(
					"text-[var(--ret-text)] transition-colors group-hover:text-[var(--ret-purple)]",
					WORDMARK_CLASS[density],
				)}
				style={{ fontFamily: "var(--font-display-serif)" }}
			>
				agent-machines
			</span>
		</>
	);

	const isSidebar = density === "sidebar";

	return (
		<Link
			href={href}
			className={cn(
				"group flex min-w-0 items-center gap-2.5",
				isSidebar ? "h-full w-full justify-between gap-2" : "shrink-0",
				className,
			)}
			aria-label="agent-machines (back to home)"
		>
			{body}
		</Link>
	);
}
