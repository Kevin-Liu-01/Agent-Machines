import Image from "next/image";

import { cn } from "@/lib/cn";

type Props = {
	size?: number;
	className?: string;
	withLabel?: boolean;
	gap?: "tight" | "default";
};

/**
 * Lockup of the Dedalus mark and the Nous Research mark separated by a thin
 * "x". The Dedalus mark keeps its native gradient (purple, looks intentional
 * across both light and dark backgrounds). The Nous mark is monochrome and
 * adopts `currentColor` via CSS mask so it tracks surrounding text color.
 *
 * Used in the public landing navbar and the dashboard status header so the
 * collaboration is the first thing a visitor sees -- Hermes Machines is the
 * binding between Dedalus's microVM runtime and Nous's agent framework.
 */
export function BrandMark({
	size = 22,
	className,
	withLabel = true,
	gap = "default",
}: Props) {
	const dim = `${size}px`;
	return (
		<span
			className={cn(
				"inline-flex items-center font-mono text-[var(--ret-text)]",
				gap === "tight" ? "gap-1.5" : "gap-2.5",
				className,
			)}
		>
			{/* Dedalus mark -- preserve native gradient */}
			<span
				aria-label="Dedalus Labs"
				className="relative inline-block shrink-0"
				style={{ width: dim, height: dim }}
			>
				<Image
					src="/brand/dedalus-logo.svg"
					alt=""
					fill
					sizes={dim}
					priority
					className="object-contain dark:hidden"
				/>
				<Image
					src="/brand/dedalus-logo-dark.svg"
					alt=""
					fill
					sizes={dim}
					priority
					className="hidden object-contain dark:block"
				/>
			</span>

			<span
				aria-hidden="true"
				className="font-mono text-[0.7em] text-[var(--ret-text-muted)]"
			>
				{"\u00d7"}
			</span>

			{/* Nous mark -- monochrome, picks up text color via mask */}
			<span
				aria-label="Nous Research"
				className="inline-block shrink-0 bg-[currentColor]"
				style={{
					width: dim,
					height: dim,
					WebkitMaskImage: "url(/brand/nous-mark.svg)",
					maskImage: "url(/brand/nous-mark.svg)",
					WebkitMaskRepeat: "no-repeat",
					maskRepeat: "no-repeat",
					WebkitMaskPosition: "center",
					maskPosition: "center",
					WebkitMaskSize: "contain",
					maskSize: "contain",
				}}
			/>

			{withLabel ? (
				<span className="text-sm">hermes-machines</span>
			) : null}
		</span>
	);
}
