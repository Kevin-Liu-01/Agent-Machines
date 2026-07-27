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
			className={cn("text-[var(--ret-text-muted)]", className)}
		>
			<g
				stroke="currentColor"
				strokeWidth="1.5"
				vectorEffect="non-scaling-stroke"
			>
				{topology === "network" ? <NetworkTopology /> : null}
				{topology === "rack" ? <RackTopology /> : null}
				{topology === "route" ? <RouteTopology /> : null}
			</g>
		</svg>
	);
}

function Node({ x, y, width = 88, height = 56 }: { x: number; y: number; width?: number; height?: number }) {
	return (
		<g>
			<rect x={x} y={y} width={width} height={height} fill="var(--ret-bg)" />
			<rect x={x + 12} y={y + 12} width={width - 24} height={height - 24} opacity="0.45" />
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
			fill={active ? "var(--ret-purple)" : "var(--ret-bg)"}
			stroke={active ? "var(--ret-purple)" : "currentColor"}
		/>
	);
}

function NetworkTopology() {
	return (
		<>
			<path d="M128 74H224V146H268M512 74H416V146H372M128 286H224V214H268M512 286H416V214H372" />
			<path d="M320 112V88M320 248V272M268 180H240M372 180H400" />
			<Node x={40} y={46} />
			<Node x={512} y={46} />
			<Node x={40} y={258} />
			<Node x={512} y={258} />
			<Node x={268} y={136} width={104} height={88} />
			<Pad x={224} y={146} />
			<Pad x={416} y={146} />
			<Pad x={224} y={214} />
			<Pad x={416} y={214} />
			<Pad x={320} y={180} active />
		</>
	);
}

function RackTopology() {
	const xs = [56, 168, 280, 392, 504];
	return (
		<>
			<path d="M100 128V208M212 128V208M324 128V208M436 128V208M548 128V208M100 208H548" />
			<path d="M212 208V272H280M436 208V272H360M324 208V248" />
			{xs.map((x) => (
				<Node key={x} x={x} y={72} />
			))}
			<Node x={280} y={272} width={80} height={48} />
			{xs.map((x) => (
				<Pad key={`pad-${x}`} x={x + 44} y={208} active={x === 280} />
			))}
		</>
	);
}

function RouteTopology() {
	const xs = [32, 176, 320, 464];
	return (
		<>
			<path d="M120 180H176M264 180H320M408 180H464" />
			<path d="M220 124V84H348V124M364 236V276H492V236" />
			{xs.map((x) => (
				<Node key={x} x={x} y={152} />
			))}
			<Pad x={148} y={180} />
			<Pad x={292} y={180} active />
			<Pad x={436} y={180} />
			<Pad x={220} y={84} />
			<Pad x={348} y={84} />
			<Pad x={364} y={276} />
			<Pad x={492} y={276} />
		</>
	);
}
