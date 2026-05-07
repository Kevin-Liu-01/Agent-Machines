import { Logo } from "@/components/Logo";
import { cn } from "@/lib/cn";

type Props = {
	size?: number;
	className?: string;
	withLabel?: boolean;
	gap?: "tight" | "default";
};

/**
 * Lockup of the Dedalus mark and the Nous Research mark separated by a thin
 * "x". Used in the public landing navbar, the dashboard status header, and
 * the sign-in card so the collaboration is the first thing a visitor sees:
 * Hermes Machines is the binding between Dedalus's microVM runtime and
 * Nous's agent framework.
 */
export function BrandMark({
	size = 22,
	className,
	withLabel = true,
	gap = "default",
}: Props) {
	return (
		<span
			className={cn(
				"inline-flex items-center font-mono text-[var(--ret-text)]",
				gap === "tight" ? "gap-1.5" : "gap-2.5",
				className,
			)}
		>
			<Logo mark="dedalus" size={size} />
			<span
				aria-hidden="true"
				className="font-mono text-[0.7em] text-[var(--ret-text-muted)]"
			>
				{"\u00d7"}
			</span>
			<Logo mark="nous" size={size} />
			{withLabel ? <span className="text-sm">hermes-machines</span> : null}
		</span>
	);
}
