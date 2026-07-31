import { SUBSTRATE_CAPABILITIES, HARNESS_CAPABILITIES } from "@/lib/mux/capabilities";
import { cn } from "@/lib/cn";

/**
 * The two multiplexed planes, drawn once.
 *
 * Left: harnesses (which agent). Right: substrates (which sandbox).
 * Center: the router that picks one of each, with the primary lane drawn
 * solid and backups dashed -- the same shape as the mermaid diagram in
 * docs/MUX.md, so the site and the docs cannot disagree.
 *
 * Strokes use currentColor so the figure inherits the active theme; no
 * hard-coded palette, no fills that vanish in light mode.
 */

const HARNESS_ROWS = HARNESS_CAPABILITIES.map((item) => item.label);
const SUBSTRATE_ROWS = SUBSTRATE_CAPABILITIES.map((item) => ({
	label: item.label,
	pty: item.pty,
}));

const ROW_HEIGHT = 34;
const ROW_GAP = 10;
const COL_WIDTH = 178;
const ROUTER_WIDTH = 150;
const PAD = 16;

const rowY = (index: number) => PAD + index * (ROW_HEIGHT + ROW_GAP);
const HEIGHT = rowY(Math.max(HARNESS_ROWS.length, SUBSTRATE_ROWS.length)) + PAD;
const ROUTER_X = PAD + COL_WIDTH + 46;
const RIGHT_X = ROUTER_X + ROUTER_WIDTH + 46;
const WIDTH = RIGHT_X + COL_WIDTH + PAD;
const ROUTER_Y = PAD + 6;
const ROUTER_HEIGHT = HEIGHT - PAD * 2 - 12;

export function MuxDiagram({ className }: { className?: string }) {
	const routerMid = ROUTER_Y + ROUTER_HEIGHT / 2;
	return (
		<figure className={cn("m-0", className)}>
			<svg
				viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
				className="h-auto w-full text-[var(--ret-text-secondary)]"
				fill="none"
				role="img"
				aria-label="Agent Machines multiplexer: four agent harnesses on the left, the router in the center, four sandbox substrates on the right. The router picks one harness and one substrate, with a primary lane and dashed backup lanes."
			>
				<title>Harness plane, router, substrate plane</title>

				{HARNESS_ROWS.map((label, index) => {
					const y = rowY(index);
					return (
						<g key={label}>
							<rect
								x={PAD}
								y={y}
								width={COL_WIDTH}
								height={ROW_HEIGHT}
								stroke="currentColor"
								strokeWidth="1"
								opacity="0.55"
								vectorEffect="non-scaling-stroke"
							/>
							<text
								x={PAD + 12}
								y={y + ROW_HEIGHT / 2 + 4}
								fill="currentColor"
								fontSize="12"
								fontWeight="500"
							>
								{label}
							</text>
							<path
								d={`M${PAD + COL_WIDTH} ${y + ROW_HEIGHT / 2}H${ROUTER_X}`}
								stroke="currentColor"
								strokeWidth="1"
								opacity="0.3"
								vectorEffect="non-scaling-stroke"
							/>
						</g>
					);
				})}

				<rect
					x={ROUTER_X}
					y={ROUTER_Y}
					width={ROUTER_WIDTH}
					height={ROUTER_HEIGHT}
					stroke="currentColor"
					strokeWidth="1.4"
					vectorEffect="non-scaling-stroke"
				/>
				<text
					x={ROUTER_X + ROUTER_WIDTH / 2}
					y={routerMid - 16}
					fill="currentColor"
					fontSize="12"
					fontWeight="600"
					textAnchor="middle"
				>
					router
				</text>
				<text
					x={ROUTER_X + ROUTER_WIDTH / 2}
					y={routerMid + 2}
					fill="currentColor"
					fontSize="10"
					opacity="0.7"
					textAnchor="middle"
					fontFamily="ui-monospace, monospace"
				>
					keys + route
				</text>
				<text
					x={ROUTER_X + ROUTER_WIDTH / 2}
					y={routerMid + 18}
					fill="currentColor"
					fontSize="10"
					opacity="0.7"
					textAnchor="middle"
					fontFamily="ui-monospace, monospace"
				>
					fail closed / over
				</text>

				{SUBSTRATE_ROWS.map((row, index) => {
					const y = rowY(index);
					const isPrimary = index === 0;
					return (
						<g key={row.label}>
							<path
								d={`M${ROUTER_X + ROUTER_WIDTH} ${routerMid}L${RIGHT_X - 14} ${routerMid}L${RIGHT_X} ${y + ROW_HEIGHT / 2}`}
								stroke="currentColor"
								strokeWidth={isPrimary ? "1.6" : "1"}
								strokeDasharray={isPrimary ? undefined : "3 3"}
								opacity={isPrimary ? "0.9" : "0.4"}
								vectorEffect="non-scaling-stroke"
							/>
							<rect
								x={RIGHT_X}
								y={y}
								width={COL_WIDTH}
								height={ROW_HEIGHT}
								stroke="currentColor"
								strokeWidth={isPrimary ? "1.4" : "1"}
								opacity={isPrimary ? "0.95" : "0.55"}
								vectorEffect="non-scaling-stroke"
							/>
							<text
								x={RIGHT_X + 12}
								y={y + ROW_HEIGHT / 2 + 4}
								fill="currentColor"
								fontSize="12"
								fontWeight={isPrimary ? "600" : "500"}
							>
								{row.label}
							</text>
							<text
								x={RIGHT_X + COL_WIDTH - 12}
								y={y + ROW_HEIGHT / 2 + 4}
								fill="currentColor"
								fontSize="9"
								opacity="0.6"
								textAnchor="end"
								fontFamily="ui-monospace, monospace"
							>
								{`pty ${row.pty}`}
							</text>
						</g>
					);
				})}

				<text
					x={PAD}
					y={HEIGHT - 3}
					fill="currentColor"
					fontSize="9"
					opacity="0.55"
					fontFamily="ui-monospace, monospace"
					letterSpacing="0.14em"
				>
					AGENTS
				</text>
				<text
					x={RIGHT_X}
					y={HEIGHT - 3}
					fill="currentColor"
					fontSize="9"
					opacity="0.55"
					fontFamily="ui-monospace, monospace"
					letterSpacing="0.14em"
				>
					SANDBOXES
				</text>
			</svg>
		</figure>
	);
}
