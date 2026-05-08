import { Logo } from "@/components/Logo";
import { cn } from "@/lib/cn";
import type { AgentKind } from "@/lib/user-config/schema";

type Props = {
	size?: number;
	className?: string;
	withLabel?: boolean;
	gap?: "tight" | "default";
	/**
	 * Agent variant of the lockup. Defaults to "hermes" (Dedalus x Nous).
	 *   - "hermes"   -> Dedalus mark x Nous mark
	 *   - "openclaw" -> Dedalus mark x OpenClaw mark
	 *
	 * The Dedalus mark is always present because Dedalus runs the
	 * machine; the right side identifies the agent personality.
	 */
	agent?: AgentKind;
};

const SECONDARY_MARK: Record<AgentKind, "nous" | "openclaw"> = {
	hermes: "nous",
	openclaw: "openclaw",
};

/**
 * Lockup of the Dedalus mark x the agent's mark separated by a thin "x".
 * Used in the public landing navbar, the dashboard status header, and
 * the sign-in card so the collaboration is the first thing a visitor sees:
 * agent-machines is the binding between Dedalus's microVM runtime and an
 * agent personality (Hermes by default, OpenClaw as an alternative).
 */
export function BrandMark({
	size = 22,
	className,
	withLabel = true,
	gap = "default",
	agent = "hermes",
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
			<Logo mark={SECONDARY_MARK[agent]} size={size} />
			{withLabel ? <span className="text-sm">agent-machines</span> : null}
		</span>
	);
}
