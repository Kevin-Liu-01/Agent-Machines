import { Logo } from "@/components/Logo";
import { cn } from "@/lib/cn";
import type { AgentKind } from "@/lib/user-config/schema";

type Variant = AgentKind | "both";

type Props = {
	size?: number;
	className?: string;
	withLabel?: boolean;
	gap?: "tight" | "default";
	/**
	 * Agent variant of the lockup. Defaults to `"both"` -- the public
	 * surface should advertise that the rig supports both agents. The
	 * dashboard StatusHeader passes the *active* agent (`hermes` or
	 * `openclaw`) so the lockup tracks the live machine.
	 *
	 *   - "hermes"   -> Dedalus mark x Nous mark
	 *   - "openclaw" -> Dedalus mark x OpenClaw mark
	 *   - "both"     -> Dedalus mark x Nous mark + OpenClaw mark
	 *
	 * The Dedalus mark is always present because Dedalus runs the
	 * machine; the right side identifies the agent personality (or
	 * personalities, in `both` mode).
	 */
	agent?: Variant;
};

const SECONDARY_MARK: Record<AgentKind, "nous" | "openclaw" | "anthropic" | "openai"> = {
	hermes: "nous",
	openclaw: "openclaw",
	"claude-code": "anthropic",
	codex: "openai",
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
	agent = "both",
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
			{agent === "both" ? (
				<span
					className={cn(
						"inline-flex items-center",
						gap === "tight" ? "gap-1" : "gap-1.5",
					)}
				>
					<Logo mark="nous" size={size} />
					<span
						aria-hidden="true"
						className="font-mono text-[0.6em] text-[var(--ret-text-muted)]"
					>
						{"/"}
					</span>
					<Logo mark="openclaw" size={size} />
				</span>
			) : (
				<Logo mark={SECONDARY_MARK[agent]} size={size} />
			)}
			{withLabel ? <span className="text-sm">agent-machines</span> : null}
		</span>
	);
}
