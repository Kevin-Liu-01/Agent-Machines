import { cn } from "@/lib/cn";

type CircuitTopology = "network" | "rack" | "route";

const NETWORK_SLUGS = new Set([
	"agents",
	"loadout",
	"mcps",
	"registry",
	"skills",
	"workers",
]);

const RACK_SLUGS = new Set([
	"artifacts",
	"benchmarks",
	"logs",
	"machines",
	"memory",
	"overview",
	"sessions",
	"usage",
]);

function topologyFor(slug: string | null | undefined): CircuitTopology {
	if (slug && NETWORK_SLUGS.has(slug)) return "network";
	if (slug && RACK_SLUGS.has(slug)) return "rack";
	return "route";
}

export function GeometricCircuit({
	slug,
	className,
	label,
}: {
	slug?: string | null;
	className?: string;
	label?: string;
}) {
	const topology = topologyFor(slug);
	return (
		<svg
			viewBox="0 0 640 360"
			fill="none"
			role={label ? "img" : undefined}
			aria-label={label}
			aria-hidden={label ? undefined : true}
			preserveAspectRatio="xMidYMid meet"
			shapeRendering="geometricPrecision"
			className={cn("text-[var(--ret-border-hover)]", className)}
		>
			<g
				stroke="currentColor"
				strokeWidth="1.25"
				strokeLinecap="square"
				strokeLinejoin="miter"
				vectorEffect="non-scaling-stroke"
			>
				{topology === "network" ? <NetworkTopology /> : null}
				{topology === "rack" ? <RackTopology /> : null}
				{topology === "route" ? <RouteTopology /> : null}
			</g>
		</svg>
	);
}

function Node({
	x,
	y,
	width = 88,
	height = 56,
	active = false,
}: {
	x: number;
	y: number;
	width?: number;
	height?: number;
	active?: boolean;
}) {
	const cut = 10;
	const points = [
		`${x + cut},${y}`,
		`${x + width - cut},${y}`,
		`${x + width},${y + cut}`,
		`${x + width},${y + height - cut}`,
		`${x + width - cut},${y + height}`,
		`${x + cut},${y + height}`,
		`${x},${y + height - cut}`,
		`${x},${y + cut}`,
	].join(" ");
	return (
		<g>
			<polygon
				points={points}
				fill="var(--ret-bg)"
				stroke={active ? "var(--ret-purple)" : "currentColor"}
				strokeWidth={active ? 1.75 : undefined}
			/>
			<path
				d={`M${x + 18} ${y + height - 16}H${x + width - 32}L${x + width - 18} ${y + height - 30}`}
				opacity="0.42"
			/>
			<path
				d={`M${x + 18} ${y + 16}H${x + 34}`}
				opacity="0.28"
			/>
		</g>
	);
}

function Pad({ x, y, active = false }: { x: number; y: number; active?: boolean }) {
	return (
		<rect
			x={x - 4}
			y={y - 4}
			width="8"
			height="8"
			transform={`rotate(45 ${x} ${y})`}
			fill={active ? "var(--ret-purple)" : "var(--ret-bg)"}
			stroke={active ? "var(--ret-purple)" : "currentColor"}
		/>
	);
}

function NetworkTopology() {
	return (
		<>
			<g opacity="0.92">
				<path d="M136 76H168L228 136H268M504 76H472L412 136H372" />
				<path d="M136 284H168L228 224H268M504 284H472L412 224H372" />
				<path d="M320 136V112L296 88M320 112L344 88" />
				<path d="M320 224V248L296 272M320 248L344 272" />
			</g>
			<g opacity="0.3">
				<path d="M136 92H160L220 152H268M504 92H480L420 152H372" />
				<path d="M136 268H160L220 208H268M504 268H480L420 208H372" />
			</g>
			<Node x={40} y={48} width={96} />
			<Node x={504} y={48} width={96} />
			<Node x={40} y={256} width={96} />
			<Node x={504} y={256} width={96} />
			<Node x={268} y={136} width={104} height={88} active />
			<Pad x={228} y={136} />
			<Pad x={412} y={136} />
			<Pad x={228} y={224} />
			<Pad x={412} y={224} />
			<Pad x={320} y={180} active />
		</>
	);
}

function RackTopology() {
	const xs = [40, 152, 264, 376, 488];
	return (
		<>
			<g opacity="0.92">
				<path d="M84 116L180 212H460" />
				<path d="M196 116L292 212" />
				<path d="M308 116V200L320 212" />
				<path d="M420 116L324 212" />
				<path d="M532 116L436 212" />
				<path d="M208 212L276 280H280M432 212L364 280H360" />
				<path d="M320 212V280" />
			</g>
			<g opacity="0.28">
				<path d="M68 116L172 220H468" />
				<path d="M548 116L444 220" />
			</g>
			{xs.map((x, index) => (
				<Node key={x} x={x} y={60} active={index === 2} />
			))}
			<Node x={280} y={280} width={80} height={48} active />
			{[180, 292, 320, 436].map((x, index) => (
				<Pad key={x} x={x} y={212} active={index === 2} />
			))}
		</>
	);
}

function RouteTopology() {
	const xs = [32, 176, 320, 464];
	return (
		<>
			<g opacity="0.92">
				<path d="M120 180H176M264 180H320M408 180H464" />
				<path d="M220 152L264 108H320L364 152" />
				<path d="M364 208L408 252H464L508 208" />
			</g>
			<g opacity="0.3">
				<path d="M76 152L124 104H180L228 152" />
				<path d="M412 208L460 256H516L564 208" />
			</g>
			{xs.map((x, index) => (
				<Node key={x} x={x} y={152} active={index === 2} />
			))}
			<Pad x={148} y={180} />
			<Pad x={292} y={180} active />
			<Pad x={436} y={180} />
			<Pad x={264} y={108} />
			<Pad x={320} y={108} />
			<Pad x={408} y={252} />
			<Pad x={464} y={252} />
		</>
	);
}
