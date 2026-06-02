"use client";

import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { Logo, type Mark } from "@/components/Logo";
import { ServiceIcon, type ServiceSlug } from "@/components/ServiceIcon";

type StationDef = {
	agent: string | null;
	mark: Mark;
	tone: "currentColor" | "native";
	theta: number;
	phi: number;
	hue: string;
	label: string;
	/** Opened in a new tab when the (already in-view) logo is clicked. */
	href: string;
};

// phi is kept at 0 for every station: the logos ride a flat equatorial ring,
// so the active logo lands exactly on the camera→origin axis and reads dead
// center in the (portrait) hero cell instead of floating above it.
const STATIONS: StationDef[] = [
	{ agent: "hermes", mark: "nous", tone: "currentColor", theta: 0, phi: 0, hue: "#7c8cf8", label: "Hermes", href: "https://github.com/NousResearch/hermes-agent" },
	{ agent: "openclaw", mark: "openclaw", tone: "currentColor", theta: (Math.PI * 2) / 5, phi: 0, hue: "#e5443b", label: "OpenClaw", href: "https://github.com/openclaw/openclaw" },
	{ agent: "claude-code", mark: "anthropic", tone: "currentColor", theta: (Math.PI * 4) / 5, phi: 0, hue: "#d4a574", label: "Claude Code", href: "https://www.anthropic.com/claude-code" },
	{ agent: "codex", mark: "openai", tone: "currentColor", theta: (Math.PI * 6) / 5, phi: 0, hue: "#4ae0a0", label: "Codex CLI", href: "https://github.com/openai/codex" },
	{ agent: null, mark: "cursor", tone: "currentColor", theta: (Math.PI * 8) / 5, phi: 0, hue: "#d2beff", label: "Cursor", href: "https://cursor.com" },
];

const LOGO_ORBIT_R = 1.8;
const CAMERA_ORBIT_R = 4.8;
const LERP_SPEED = 3.0;

/* ── Substrate → center model ─────────────────────────────────────── */

export type SubstrateId = "e2b" | "sprites" | "dedalus" | "vercel";

type SubstrateModel = {
	/** Dominant background polyhedron — bright, frames the agent icon. */
	outer: () => THREE.BufferGeometry;
	/** Counter-rotating inner shape — adds a mechanical "core" read. */
	inner: () => THREE.BufferGeometry;
	hue: string;
	/** Base Y spin rate (rad/s) for the outer shell. */
	spin: number;
	/** Resting tilt [x,y,z] so flat-faced shapes read as 3D, not head-on. */
	tilt?: [number, number, number];
};

/**
 * Each substrate lane maps to a distinct nested wireframe assembly + tint.
 * Silhouette radii are held at ~0.6 so even the corner-/vertex-forward spin
 * stays fully inside the narrow portrait hero cell (geometries are re-centered
 * at the origin in `SubstrateCore`, so the core is pinned dead-center while it
 * spins). Flat-faced shapes get a resting tilt so their volume always reads.
 * The shapes are chosen to evoke the brand:
 *   E2B      → a sandbox: a box nested inside a box (isometric tilt)
 *   Sprites  → a dense geodesic micro-orb
 *   Dedalus  → an engineered dodecahedron gem around an octahedron
 *   Vercel   → the triangle: a tetrahedron over a tetrahedron
 */
const SUBSTRATE_VISUAL: Record<SubstrateId, SubstrateModel> = {
	e2b: {
		outer: () => new THREE.BoxGeometry(0.72, 0.72, 0.72),
		inner: () => new THREE.BoxGeometry(0.38, 0.38, 0.38),
		hue: "#ff8800",
		spin: 0.22,
		tilt: [0.52, Math.PI / 4, 0],
	},
	sprites: {
		outer: () => new THREE.IcosahedronGeometry(0.62, 1),
		inner: () => new THREE.IcosahedronGeometry(0.32, 0),
		hue: "#22c55e",
		spin: 0.26,
	},
	dedalus: {
		outer: () => new THREE.DodecahedronGeometry(0.62, 0),
		inner: () => new THREE.OctahedronGeometry(0.34, 0),
		hue: "#aaa5e6",
		spin: 0.2,
	},
	vercel: {
		outer: () => new THREE.TetrahedronGeometry(0.62, 0),
		inner: () => new THREE.TetrahedronGeometry(0.34, 0),
		hue: "#ededed",
		spin: 0.24,
		tilt: [0.42, 0.3, 0],
	},
};

function easeOutBack(t: number): number {
	const c1 = 1.70158;
	const c3 = c1 + 1;
	return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

function stationLogoPos(s: StationDef): [number, number, number] {
	return [
		LOGO_ORBIT_R * Math.sin(s.theta),
		s.phi,
		LOGO_ORBIT_R * Math.cos(s.theta),
	];
}

function stationCameraPos(s: StationDef): THREE.Vector3 {
	// y = 0: the camera, the origin, and the active logo are colinear, so the
	// logo projects to the exact center of the viewport and the substrate core
	// (at the origin) sits directly behind it.
	return new THREE.Vector3(
		CAMERA_ORBIT_R * Math.sin(s.theta),
		0,
		CAMERA_ORBIT_R * Math.cos(s.theta),
	);
}

/* ── Substrate core: nested wireframe that swaps per substrate ── */

function SubstrateCore({ substrate }: { substrate: SubstrateId }) {
	const pop = useRef<THREE.Group>(null);
	const outerSpin = useRef<THREE.Group>(null);
	const innerSpin = useRef<THREE.Group>(null);
	const outerMat = useRef<THREE.LineBasicMaterial>(null);
	const innerMat = useRef<THREE.LineBasicMaterial>(null);
	const appear = useRef(0);
	const clock = useRef(0);

	const { outer, inner, hue, spin, tilt } = SUBSTRATE_VISUAL[substrate];

	// `outer`/`inner` are stable module-level fns per substrate, so the geometry
	// rebuilds only when the substrate actually changes. `center()` guarantees
	// the buffer's centroid is the origin so the shape is pinned dead-center;
	// the resting tilt is baked into the buffer (still about the origin) so the
	// Y spin tumbles an already-volumetric shape.
	const outerGeom = useMemo(() => {
		const g = outer().center();
		if (tilt) g.rotateX(tilt[0]).rotateY(tilt[1]).rotateZ(tilt[2]);
		return g;
	}, [outer, tilt]);
	const innerGeom = useMemo(() => {
		const g = inner().center();
		if (tilt) g.rotateX(tilt[0]).rotateY(tilt[1]).rotateZ(tilt[2]);
		return g;
	}, [inner, tilt]);

	// Reset the pop-in whenever the shape swaps, and dispose the old buffers.
	useEffect(() => {
		appear.current = 0;
		return () => {
			outerGeom.dispose();
			innerGeom.dispose();
		};
	}, [outerGeom, innerGeom]);

	useFrame((_, delta) => {
		clock.current += delta;
		// Spin happens entirely around the origin (groups are never translated),
		// so the core stays anchored dead-center no matter the camera orbit. The
		// X tilt is a bounded sine wobble — it reads as 3D without ever tumbling
		// the silhouette out of the narrow frame.
		if (outerSpin.current) {
			outerSpin.current.rotation.y += delta * spin;
			outerSpin.current.rotation.x = Math.sin(clock.current * 0.5) * 0.16;
		}
		if (innerSpin.current) {
			innerSpin.current.rotation.y -= delta * spin * 1.4;
			innerSpin.current.rotation.z += delta * spin * 0.5;
		}
		if (appear.current < 1) {
			appear.current = Math.min(1, appear.current + delta * 2.6);
			const e = easeOutBack(appear.current);
			// Uniform scale about the origin keeps the pop-in perfectly centered.
			if (pop.current) pop.current.scale.setScalar(0.4 + 0.6 * e);
			if (outerMat.current) outerMat.current.opacity = 0.98 * appear.current;
			if (innerMat.current) innerMat.current.opacity = 0.5 * appear.current;
		}
	});

	return (
		<group ref={pop}>
			<group ref={outerSpin}>
				<lineSegments>
					<wireframeGeometry args={[outerGeom]} />
					<lineBasicMaterial ref={outerMat} color={hue} transparent opacity={0.98} />
				</lineSegments>
			</group>
			<group ref={innerSpin}>
				<lineSegments>
					<wireframeGeometry args={[innerGeom]} />
					<lineBasicMaterial ref={innerMat} color={hue} transparent opacity={0.5} />
				</lineSegments>
			</group>
		</group>
	);
}

function CursorIcon({ size }: { size: number }) {
	return (
		<svg
			viewBox="80 60 360 400"
			fill="currentColor"
			width={size}
			height={size}
		>
			<path d="m415.035 156.35-151.503-87.4695c-4.865-2.8094-10.868-2.8094-15.733 0l-151.4969 87.4695c-4.0897 2.362-6.6146 6.729-6.6146 11.459v176.383c0 4.73 2.5249 9.097 6.6146 11.458l151.5039 87.47c4.865 2.809 10.868 2.809 15.733 0l151.504-87.47c4.089-2.361 6.614-6.728 6.614-11.458v-176.383c0-4.73-2.525-9.097-6.614-11.459zm-9.516 18.528-146.255 253.32c-.988 1.707-3.599 1.01-3.599-.967v-165.872c0-3.314-1.771-6.379-4.644-8.044l-143.645-82.932c-1.707-.988-1.01-3.599.968-3.599h292.509c4.154 0 6.75 4.503 4.673 8.101h-.007z" />
		</svg>
	);
}

/** Dedalus symbol only (the swirl), extracted from the wide wordmark lockup so
 *  it reads inside a square chip instead of cropping to "Dedalus Labs". */
function DedalusSymbol({ size }: { size: number }) {
	return (
		<svg
			viewBox="1900 25 300 296"
			width={size}
			height={size}
			fill="currentColor"
			aria-hidden="true"
		>
			<path d="M2191.02 31.0007C2191.55 30.9809 2192.01 31.3973 2192.07 31.9323L2192.25 33.736H2192.23C2193.16 42.9925 2192.25 51.9123 2190.56 60.8913C2188.78 69.8108 2185.96 78.5919 2182.14 86.9763C2174.57 103.785 2163.07 119.007 2149.15 131.336C2147.43 132.901 2145.69 134.428 2143.86 135.875L2141.15 138.055L2138.49 140.057C2134.92 142.713 2131.45 145.469 2127.77 147.986L2122.28 151.811C2120.43 153.08 2118.53 154.269 2116.65 155.498C2112.92 158.015 2109.04 160.275 2105.15 162.554C2089.57 171.672 2072.88 178.907 2056.69 185.19L2032.61 194.565C2024.66 197.697 2016.77 200.869 2008.9 204.139C2004.96 205.745 2001.09 207.509 1997.15 209.154L1994.21 210.403L1988.98 212.86L1986.42 214.248C1979.6 217.934 1973.14 222.414 1967.1 227.588C1954.97 237.895 1944.66 250.877 1935.8 264.99C1927.04 279.142 1919.55 294.603 1913.76 310.539L1913.12 312.303C1912.95 312.799 1912.43 313.076 1911.94 312.977L1909.02 312.383C1908.49 312.283 1908.13 311.788 1908.19 311.233L1908.39 309.429C1909.32 300.47 1911.2 291.867 1913.6 283.285C1915.94 274.702 1919.03 266.278 1922.64 258.033C1929.97 241.641 1939.72 225.823 1952.89 212.444C1959.45 205.764 1966.8 199.699 1974.91 194.605L1977.96 192.722L1981.11 190.998L1984.28 189.273L1987.24 187.806C1991.18 185.864 1995.1 183.862 1999.09 182.039C2014.97 174.507 2031.3 167.768 2047.23 161.405C2055.22 158.194 2062.97 154.943 2070.62 151.573C2078.25 148.203 2085.63 144.517 2092.96 140.652C2096.59 138.63 2100.24 136.687 2103.82 134.547C2105.63 133.496 2107.43 132.466 2109.22 131.376L2114.55 128.046C2118.14 125.885 2121.64 123.526 2125.17 121.247L2127.83 119.522L2130.28 117.798L2132.76 116.093L2135.16 114.309C2147.99 104.716 2159.24 93.0017 2168.1 79.3649C2172.56 72.5663 2176.37 65.2519 2179.56 57.6208C2181.17 53.7953 2182.57 49.8708 2183.76 45.8669C2185.01 41.9027 2186.02 37.7204 2186.74 33.7761L2187.07 31.8727C2187.17 31.3776 2187.59 31.0207 2188.1 31.0007H2191.02ZM2155.76 249.845C2156.16 249.548 2156.73 249.568 2157.11 249.924L2158.73 251.431C2159.13 251.788 2159.19 252.383 2158.87 252.819L2158.02 254.008H2158.04C2148.7 266.932 2136.99 277.694 2123.91 286.851C2110.83 295.91 2096 303.164 2080.12 306.99C2072.35 308.932 2064.52 310.261 2056.67 311.252C2048.83 312.144 2040.96 312.719 2033.13 312.838C2017.43 313.016 2001.83 312.005 1986.41 308.755L1984.96 308.457C1984.45 308.358 1984.09 307.862 1984.13 307.346L1984.31 305.107C1984.35 304.592 1984.76 304.195 1985.26 304.135L1986.77 304.017C2002.03 302.729 2017.23 301.361 2032.19 299.498C2039.69 298.606 2047.1 297.436 2054.47 296.227C2061.83 294.879 2069.12 293.472 2076.26 291.648C2090.27 288.179 2103.73 282.432 2116.77 275.336C2129.75 268.22 2142.4 259.855 2154.53 250.777L2155.76 249.845ZM2187.3 135.357C2187.56 134.961 2188.03 134.762 2188.49 134.901L2190.53 135.515C2191.01 135.654 2191.32 136.13 2191.28 136.626L2191.13 138.271H2191.17C2190.31 146.695 2187.95 154.524 2184.9 162.215C2181.81 169.865 2177.91 177.239 2173.29 184.157C2168.63 191.055 2163.32 197.595 2157.31 203.482C2154.32 206.435 2151.17 209.23 2147.9 211.886C2144.62 214.523 2141.28 216.921 2137.85 219.299C2124.07 228.596 2108.91 235.712 2093.13 240.291C2085.24 242.59 2077.21 244.255 2069.11 245.246C2065.06 245.741 2060.98 246.079 2056.92 246.158C2052.81 246.277 2048.81 246.217 2044.61 245.741L2043 245.563C2042.49 245.504 2042.09 245.087 2042.07 244.572L2041.97 242.293C2041.95 241.797 2042.27 241.361 2042.74 241.222L2044.37 240.786C2051.78 238.824 2059.25 236.465 2066.45 233.908C2073.68 231.351 2080.74 228.457 2087.64 225.365C2101.41 219.101 2114.5 211.747 2126.61 203.145C2132.69 198.824 2138.42 194.246 2143.87 189.35C2146.59 186.873 2149.22 184.315 2151.84 181.718C2154.4 179.062 2156.97 176.387 2159.41 173.592C2169.28 162.493 2178.24 150.064 2186.37 136.863L2187.3 135.357Z" />
		</svg>
	);
}

/* ── Shared chip + brand faces ── */

/** The dark logo tile used by every orbit chip + the locked config readout. */
function LogoChip({
	glow,
	hue,
	size,
	children,
}: {
	glow: boolean;
	hue: string;
	size: number;
	children: ReactNode;
}) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				width: size,
				height: size,
				borderRadius: Math.round(size * 0.26),
				background: "#0a0a0c",
				boxShadow: glow
					? `0 0 ${size * 0.32}px ${hue}, 0 0 ${size * 0.8}px ${hue}55`
					: "none",
				border: glow
					? `1px solid ${hue}`
					: "1px solid rgba(255,255,255,0.08)",
				color: "#ededed",
				overflow: "hidden",
			}}
		>
			{children}
		</div>
	);
}

/** Agent brand face (cursor gets its bespoke glyph). */
function AgentFace({ mark, size }: { mark: Mark; size: number }) {
	return mark === "cursor" ? (
		<CursorIcon size={size} />
	) : (
		<Logo mark={mark} size={size} tone="currentColor" />
	);
}

/** Substrate brand face — e2b/sprites/vercel are ServiceIcons; dedalus uses its
 *  symbol-only glyph so the wide wordmark doesn't crop inside the square chip. */
function SubstrateFace({ id, size }: { id: SubstrateId; size: number }) {
	return id === "dedalus" ? (
		<DedalusSymbol size={size} />
	) : (
		<ServiceIcon slug={id as ServiceSlug} size={size} />
	);
}

/* ── Single logo station (portrait orbit) ── */

function LogoStation({
	station,
	active,
}: {
	station: StationDef;
	active: boolean;
}) {
	const pos = stationLogoPos(station);

	return (
		<group position={pos}>
			<Html
				center
				sprite
				distanceFactor={4.1}
				zIndexRange={active ? [100, 90] : [10, 0]}
			>
				<div
					style={{
						opacity: active ? 1 : 0.2,
						// Grow + snap on lock; inactive logos sit smaller and dim.
						transform: active ? "scale(1.2)" : "scale(0.86)",
						transition:
							"opacity 0.4s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)",
						pointerEvents: "none",
						zIndex: active ? 100 : 0,
					}}
				>
					<LogoChip glow={active} hue={station.hue} size={56}>
						<AgentFace mark={station.mark} size={32} />
					</LogoChip>
				</div>
			</Html>
			{active && (
				<pointLight
					color={station.hue}
					intensity={0.8}
					distance={3}
					decay={2}
				/>
			)}
		</group>
	);
}

/* ── Orbital camera controller ── */

const ZOOM_OUT_SCALE = 2.2;
const INTRO_DURATION = 4.0;
const INTRO_TOTAL_SWEEP = Math.PI * 6;

function cubicBezierEase(t: number): number {
	const c = 1 - t;
	return 1 - c * c * c;
}

function nearestStationIdx(angle: number): number {
	const norm = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
	let best = 0;
	let bestDist = Infinity;
	for (let i = 0; i < STATIONS.length; i++) {
		const sTheta = ((STATIONS[i].theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
		const d = Math.min(
			Math.abs(norm - sTheta),
			Math.PI * 2 - Math.abs(norm - sTheta),
		);
		if (d < bestDist) {
			bestDist = d;
			best = i;
		}
	}
	return best;
}

function OrbitalCamera({
	targetIdx,
	introActive,
	onIntroStation,
	onIntroDone,
}: {
	targetIdx: number;
	introActive: boolean;
	onIntroStation: (idx: number) => void;
	onIntroDone: () => void;
}) {
	const { camera } = useThree();
	const targetPos = useRef(stationCameraPos(STATIONS[0]));
	const elapsed = useRef(0);
	const lastIntroStation = useRef(-1);
	const introDone = useRef(false);

	useEffect(() => {
		if (!introActive) {
			targetPos.current = stationCameraPos(STATIONS[targetIdx]);
		}
	}, [targetIdx, introActive]);

	useFrame((_, delta) => {
		if (introActive && !introDone.current) {
			elapsed.current += delta;
			const rawT = Math.min(elapsed.current / INTRO_DURATION, 1);
			const easedT = cubicBezierEase(rawT);

			const endCam = stationCameraPos(STATIONS[0]);

			const angle = INTRO_TOTAL_SWEEP * easedT;
			const zoom = ZOOM_OUT_SCALE + (1 - ZOOM_OUT_SCALE) * easedT;
			const r = CAMERA_ORBIT_R * zoom;
			const yBlend = 1.6 + (endCam.y - 1.6) * easedT;

			camera.position.set(
				r * Math.sin(angle),
				yBlend,
				r * Math.cos(angle),
			);
			// Always frame the origin — the core lives there, so it stays
			// pinned to the container center through the whole intro sweep.
			camera.lookAt(0, 0, 0);

			const angularSpeed = (INTRO_TOTAL_SWEEP / INTRO_DURATION) * (1 - easedT) * (1 - easedT) * 3;
			const leadOffset = angularSpeed * 0.35;
			const nearest = nearestStationIdx(angle + leadOffset);
			if (nearest !== lastIntroStation.current) {
				lastIntroStation.current = nearest;
				onIntroStation(nearest);
			}

			if (rawT >= 1) {
				introDone.current = true;
				onIntroStation(0);
				onIntroDone();
				camera.position.copy(endCam);
				camera.lookAt(0, 0, 0);
				targetPos.current = endCam;
			}
		} else {
			const t = 1 - Math.exp(-LERP_SPEED * delta);
			camera.position.lerp(targetPos.current, t);
			camera.lookAt(0, 0, 0);
		}
	});

	return null;
}

/* ── Gear mode: two flat meshing wheels (agents outer, substrates inner) turn
 *  to align the active combination at the top, while the 3D substrate core
 *  spins in the hub. Flat to the screen (XY plane) — no 3D orbit tilt. ── */

const GEAR_OFFSET: [number, number, number] = [2.25, 0, 0]; // pushed right, on the glow
const AGENT_GEAR_R = 2.62; // agent-logo ring radius (outer wheel)
const SUB_GEAR_R = 1.34; // substrate-logo ring radius (inner wheel)
const GEAR_LERP = 2.8; // how fast a wheel turns the active to the lock
const GEAR_LOCK = Math.PI; // 9 o'clock — the active combo aligns on the LEFT
const SUBSTRATE_IDS: SubstrateId[] = ["e2b", "sprites", "dedalus", "vercel"];

const SUBSTRATE_LABEL: Record<SubstrateId, string> = {
	e2b: "E2B",
	sprites: "Sprites",
	dedalus: "Dedalus",
	vercel: "Vercel",
};

/** Opened in a new tab when the (already in-view) substrate logo is clicked. */
const SUBSTRATE_URL: Record<SubstrateId, string> = {
	e2b: "https://e2b.dev",
	sprites: "https://sprites.dev",
	dedalus: "https://www.dedaluslabs.ai",
	vercel: "https://vercel.com/sandbox",
};

/** Open a brand site in a new tab (guarded for SSR). */
function openSite(href: string) {
	if (typeof window !== "undefined") {
		window.open(href, "_blank", "noopener,noreferrer");
	}
}

/** Even angular slot for each substrate on the inner ring. */
const subTheta = (id: SubstrateId): number =>
	(SUBSTRATE_IDS.indexOf(id) / SUBSTRATE_IDS.length) * Math.PI * 2;

/** Shortest-path angular lerp so a wheel turns the short way to its lock. */
function lerpAngle(a: number, b: number, t: number): number {
	let diff = (b - a) % (Math.PI * 2);
	if (diff > Math.PI) diff -= Math.PI * 2;
	if (diff < -Math.PI) diff += Math.PI * 2;
	return a + diff * t;
}

/** Wheel line color that adapts to the theme (light wheels on dark, dark on
 *  light). three.js can't read CSS vars, so we watch the root `light` class. */
function useWireColor(): string {
	const [light, setLight] = useState(false);
	useEffect(() => {
		const el = document.documentElement;
		const sync = () => {
			const t = el.getAttribute("data-theme");
			const isLight =
				t === "light" ||
				(t !== "dark" &&
					typeof window !== "undefined" &&
					window.matchMedia?.("(prefers-color-scheme: light)").matches);
			setLight(Boolean(isLight));
		};
		sync();
		const obs = new MutationObserver(sync);
		obs.observe(el, {
			attributes: true,
			attributeFilter: ["data-theme", "class"],
		});
		return () => obs.disconnect();
	}, []);
	return light ? "#363b47" : "#aab0c4";
}

/* ── Flat wheel geometry (XY plane, faces the camera) ── */

function gearToothGeom(
	rRoot: number,
	rTip: number,
	teeth: number,
): THREE.BufferGeometry {
	const pts: THREE.Vector3[] = [];
	const step = (Math.PI * 2) / teeth;
	for (let i = 0; i < teeth; i++) {
		const a = i * step;
		pts.push(new THREE.Vector3(Math.cos(a) * rRoot, Math.sin(a) * rRoot, 0));
		pts.push(
			new THREE.Vector3(
				Math.cos(a + step * 0.2) * rTip,
				Math.sin(a + step * 0.2) * rTip,
				0,
			),
		);
		pts.push(
			new THREE.Vector3(
				Math.cos(a + step * 0.3) * rTip,
				Math.sin(a + step * 0.3) * rTip,
				0,
			),
		);
		pts.push(
			new THREE.Vector3(
				Math.cos(a + step * 0.5) * rRoot,
				Math.sin(a + step * 0.5) * rRoot,
				0,
			),
		);
	}
	return new THREE.BufferGeometry().setFromPoints(pts);
}

function ringGeom(r: number, seg = 110): THREE.BufferGeometry {
	const pts: THREE.Vector3[] = [];
	for (let i = 0; i < seg; i++) {
		const a = (i / seg) * Math.PI * 2;
		pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
	}
	return new THREE.BufferGeometry().setFromPoints(pts);
}

function radialGeom(rIn: number, rOut: number, n: number): THREE.BufferGeometry {
	const pts: THREE.Vector3[] = [];
	for (let i = 0; i < n; i++) {
		const a = (i / n) * Math.PI * 2;
		pts.push(new THREE.Vector3(Math.cos(a) * rIn, Math.sin(a) * rIn, 0));
		pts.push(new THREE.Vector3(Math.cos(a) * rOut, Math.sin(a) * rOut, 0));
	}
	return new THREE.BufferGeometry().setFromPoints(pts);
}

/** A detailed flat wheel: teeth, root + pitch rims, graduation ticks (the tool /
 *  capability detail), spokes, and a hub. Static — the parent group spins it. */
function GearWheel({
	rRoot,
	rTip,
	rRim,
	rHub,
	teeth,
	spokes,
	ticks,
	hue = "#aab0c4",
	opacity = 0.82,
}: {
	rRoot: number;
	rTip: number;
	rRim: number;
	rHub: number;
	teeth: number;
	spokes: number;
	ticks: number;
	hue?: string;
	opacity?: number;
}) {
	// Base opacity drives the whole wheel; the sub-elements scale off it so the
	// teeth/pitch read boldly while spokes + ticks stay a supporting detail.
	const tooth = useMemo(
		() => gearToothGeom(rRoot, rTip, teeth),
		[rRoot, rTip, teeth],
	);
	const root = useMemo(() => ringGeom(rRoot), [rRoot]);
	const pitch = useMemo(() => ringGeom(rRim), [rRim]);
	const hub = useMemo(() => ringGeom(rHub), [rHub]);
	const tick = useMemo(
		() => radialGeom(rRim, rRim + 0.07, ticks),
		[rRim, ticks],
	);
	const innerTick = useMemo(
		() => radialGeom(rHub, rHub + 0.05, Math.round(ticks * 0.66)),
		[rHub, ticks],
	);
	const spoke = useMemo(() => radialGeom(rHub, rRim, spokes), [rHub, rRim, spokes]);
	useEffect(
		() => () => {
			tooth.dispose();
			root.dispose();
			pitch.dispose();
			hub.dispose();
			tick.dispose();
			innerTick.dispose();
			spoke.dispose();
		},
		[tooth, root, pitch, hub, tick, innerTick, spoke],
	);
	return (
		<group>
			<lineLoop geometry={tooth}>
				<lineBasicMaterial color={hue} transparent opacity={opacity} />
			</lineLoop>
			<lineLoop geometry={root}>
				<lineBasicMaterial color={hue} transparent opacity={opacity * 0.62} />
			</lineLoop>
			<lineSegments geometry={tick}>
				<lineBasicMaterial color={hue} transparent opacity={opacity * 0.58} />
			</lineSegments>
			<lineLoop geometry={pitch}>
				<lineBasicMaterial color={hue} transparent opacity={opacity * 0.82} />
			</lineLoop>
			<lineSegments geometry={spoke}>
				<lineBasicMaterial color={hue} transparent opacity={opacity * 0.46} />
			</lineSegments>
			<lineSegments geometry={innerTick}>
				<lineBasicMaterial color={hue} transparent opacity={opacity * 0.52} />
			</lineSegments>
			<lineLoop geometry={hub}>
				<lineBasicMaterial color={hue} transparent opacity={opacity * 0.64} />
			</lineLoop>
		</group>
	);
}

/**
 * A flat brand chip mounted on a wheel; the active one grows + glows. Clickable
 * when `onClick` is set: an idle chip turns its wheel to bring it into view at
 * the lock, and clicking the in-view chip opens its site (decided by the caller).
 */
function GearChip({
	active,
	hue,
	title,
	onClick,
	children,
}: {
	active: boolean;
	hue: string;
	title?: string;
	onClick?: () => void;
	children: ReactNode;
}) {
	return (
		<Html
			center
			sprite
			distanceFactor={6.4}
			// Always above the wheels (Html overlays the canvas); active sits on top.
			zIndexRange={active ? [500, 490] : [60, 40]}
		>
			<div
				title={title}
				onClick={onClick}
				style={{
					opacity: active ? 1 : 0.55,
					transform: active ? "scale(1.2)" : "scale(0.86)",
					transition:
						"opacity 0.4s ease, transform 0.55s cubic-bezier(0.34,1.56,0.64,1)",
					// Re-enabled per-chip even though the hero orbit wrapper is
					// pointer-events:none, so only the logos are interactive.
					pointerEvents: onClick ? "auto" : "none",
					cursor: onClick ? "pointer" : "default",
				}}
			>
				<LogoChip glow={active} hue={hue} size={active ? 70 : 54}>
					{children}
				</LogoChip>
			</div>
		</Html>
	);
}

/**
 * A radial arm (pitch rim → tooth) running under a chip, so each logo reads as
 * a component seated on the gear rather than floating over it. Drawn in the
 * wire color, or the chip's hue when active. Lives inside the wheel group, so
 * it turns with the gear and stays under its chip.
 */
function ChipMount({
	theta,
	rIn,
	rOut,
	color,
	opacity,
}: {
	theta: number;
	rIn: number;
	rOut: number;
	color: string;
	opacity: number;
}) {
	const arm = useMemo(() => {
		const c = Math.cos(theta);
		const s = Math.sin(theta);
		return new THREE.BufferGeometry().setFromPoints([
			new THREE.Vector3(c * rIn, s * rIn, 0),
			new THREE.Vector3(c * rOut, s * rOut, 0),
		]);
	}, [theta, rIn, rOut]);
	useEffect(() => () => arm.dispose(), [arm]);
	return (
		<lineSegments geometry={arm}>
			<lineBasicMaterial color={color} transparent opacity={opacity} />
		</lineSegments>
	);
}

/** Inner wheel — substrates. Turns so the active substrate rides up to the top
 *  lock, where it sits just under the active agent (the active combination). */
function SubstrateGear({
	activeSubstrate,
	wire,
	onSelect,
}: {
	activeSubstrate: SubstrateId;
	wire: string;
	onSelect?: (id: SubstrateId) => void;
}) {
	const g = useRef<THREE.Group>(null);
	const target = useRef(GEAR_LOCK - subTheta(activeSubstrate));
	useEffect(() => {
		target.current = GEAR_LOCK - subTheta(activeSubstrate);
	}, [activeSubstrate]);
	useFrame((_, delta) => {
		if (!g.current) return;
		g.current.rotation.z = lerpAngle(
			g.current.rotation.z,
			target.current,
			1 - Math.exp(-GEAR_LERP * delta),
		);
	});
	return (
		<group ref={g}>
			<GearWheel
				rRoot={1.56}
				rTip={1.78}
				rRim={1.16}
				rHub={0.86}
				teeth={38}
				spokes={6}
				ticks={30}
				hue={wire}
			/>
			{SUBSTRATE_IDS.map((s) => {
				const active = s === activeSubstrate;
				const th = subTheta(s);
				const hue = SUBSTRATE_VISUAL[s].hue;
				return (
					<group key={s}>
						<ChipMount
							theta={th}
							rIn={1.16}
							rOut={1.74}
							color={active ? hue : wire}
							opacity={active ? 0.95 : 0.42}
						/>
						<group
							position={[
								Math.cos(th) * SUB_GEAR_R,
								Math.sin(th) * SUB_GEAR_R,
								0.06,
							]}
						>
							<GearChip
								active={active}
								hue={hue}
								title={
									active
										? `Open ${SUBSTRATE_LABEL[s]} ↗`
										: `Show ${SUBSTRATE_LABEL[s]}`
								}
								onClick={() =>
									active ? openSite(SUBSTRATE_URL[s]) : onSelect?.(s)
								}
							>
								<SubstrateFace id={s} size={active ? 36 : 30} />
							</GearChip>
						</group>
					</group>
				);
			})}
		</group>
	);
}

/** Outer wheel — agents. Turns so the active agent rides up to the top lock. */
function AgentGear({
	activeIdx,
	wire,
	onSelect,
}: {
	activeIdx: number;
	wire: string;
	onSelect?: (idx: number) => void;
}) {
	const g = useRef<THREE.Group>(null);
	const target = useRef(GEAR_LOCK - STATIONS[activeIdx].theta);
	useEffect(() => {
		target.current = GEAR_LOCK - STATIONS[activeIdx].theta;
	}, [activeIdx]);
	useFrame((_, delta) => {
		if (!g.current) return;
		g.current.rotation.z = lerpAngle(
			g.current.rotation.z,
			target.current,
			1 - Math.exp(-GEAR_LERP * delta),
		);
	});
	return (
		<group ref={g}>
			<GearWheel
				rRoot={2.86}
				rTip={3.12}
				rRim={2.42}
				rHub={1.82}
				teeth={60}
				spokes={10}
				ticks={48}
				hue={wire}
			/>
			{STATIONS.map((s, i) => {
				const active = i === activeIdx;
				return (
					<group key={s.agent ?? "cursor"}>
						<ChipMount
							theta={s.theta}
							rIn={2.42}
							rOut={3.02}
							color={active ? s.hue : wire}
							opacity={active ? 0.95 : 0.4}
						/>
						<group
							position={[
								Math.cos(s.theta) * AGENT_GEAR_R,
								Math.sin(s.theta) * AGENT_GEAR_R,
								0.06,
							]}
						>
							<GearChip
								active={active}
								hue={s.hue}
								title={active ? `Open ${s.label} ↗` : `Show ${s.label}`}
								onClick={() => (active ? openSite(s.href) : onSelect?.(i))}
							>
								<AgentFace mark={s.mark} size={active ? 40 : 32} />
							</GearChip>
						</group>
					</group>
				);
			})}
		</group>
	);
}

/** A chevron just outside the left of the wheel, pointing in at the combo. */
function LockMark({ color }: { color: string }) {
	const geom = useMemo(() => {
		const pts = [
			new THREE.Vector3(-3.5, 0.26, 0),
			new THREE.Vector3(-3.24, 0, 0),
			new THREE.Vector3(-3.24, 0, 0),
			new THREE.Vector3(-3.5, -0.26, 0),
		];
		return new THREE.BufferGeometry().setFromPoints(pts);
	}, []);
	useEffect(() => () => geom.dispose(), [geom]);
	return (
		<lineSegments geometry={geom}>
			<lineBasicMaterial color={color} transparent opacity={0.7} />
		</lineSegments>
	);
}

/**
 * The Agent Machines mark seated at the gear hub — the brand is the core the
 * two wheels (agents × substrates) mesh around. Billboarded and theme-aware via
 * `--ret-text`; a soft `--ret-bg` well separates it from the substrate cage,
 * which keeps spinning behind it.
 */
function HubLogo() {
	return (
		<Html center sprite distanceFactor={6.4} zIndexRange={[200, 190]}>
			<div
				style={{
					display: "grid",
					placeItems: "center",
					width: 104,
					height: 104,
					background:
						"radial-gradient(circle, var(--ret-bg) 20%, transparent 66%)",
					color: "var(--ret-text)",
					pointerEvents: "none",
				}}
			>
				<Logo mark="am" size={46} />
			</div>
		</Html>
	);
}

function GearScene({
	activeIdx,
	activeSubstrate,
	onSelectAgent,
	onSelectSubstrate,
}: {
	activeIdx: number;
	activeSubstrate: SubstrateId;
	onSelectAgent?: (idx: number) => void;
	onSelectSubstrate?: (id: SubstrateId) => void;
}) {
	const wire = useWireColor();
	return (
		<group position={GEAR_OFFSET}>
			{/* the 3D substrate shape spins in the hub, behind the brand mark */}
			<SubstrateCore substrate={activeSubstrate} />
			{/* the Agent Machines mark is the core the two wheels mesh around */}
			<HubLogo />
			{/* two flat wheels mesh; each turns its active chip up to the top lock */}
			<SubstrateGear
				activeSubstrate={activeSubstrate}
				wire={wire}
				onSelect={onSelectSubstrate}
			/>
			<AgentGear activeIdx={activeIdx} wire={wire} onSelect={onSelectAgent} />
			<LockMark color={wire} />
		</group>
	);
}

/** Static camera that simply frames the origin (no station snapping). */
function FixedLook() {
	const { camera } = useThree();
	useEffect(() => {
		camera.lookAt(0, 0, 0);
	}, [camera]);
	return null;
}

/* ── Main exported scene ── */

type Props = {
	activeAgent: string | null;
	activeSubstrate?: SubstrateId;
	mode?: "portrait" | "gears";
	/** Gear mode: click an idle agent chip to turn it into view (by index). */
	onSelectAgent?: (idx: number) => void;
	/** Gear mode: click an idle substrate chip to turn it into view. */
	onSelectSubstrate?: (id: SubstrateId) => void;
};

export function HeroOrbitScene({
	activeAgent,
	activeSubstrate = "dedalus",
	mode = "portrait",
	onSelectAgent,
	onSelectSubstrate,
}: Props) {
	const [introActive, setIntroActive] = useState(true);
	const [introStationIdx, setIntroStationIdx] = useState(0);

	const settledIdx = useMemo(() => {
		const idx = STATIONS.findIndex((s) => s.agent === activeAgent);
		return idx >= 0 ? idx : 0;
	}, [activeAgent]);

	if (mode === "gears") {
		return (
			<>
				<FixedLook />
				<ambientLight intensity={0.45} />
				<GearScene
					activeIdx={settledIdx}
					activeSubstrate={activeSubstrate}
					onSelectAgent={onSelectAgent}
					onSelectSubstrate={onSelectSubstrate}
				/>
			</>
		);
	}

	const activeIdx = introActive ? introStationIdx : settledIdx;

	return (
		<>
			<OrbitalCamera
				targetIdx={settledIdx}
				introActive={introActive}
				onIntroStation={setIntroStationIdx}
				onIntroDone={() => setIntroActive(false)}
			/>
			<ambientLight intensity={0.3} />
			<SubstrateCore substrate={activeSubstrate} />
			{STATIONS.map((s, i) => (
				<LogoStation key={s.agent ?? "cursor"} station={s} active={i === activeIdx} />
			))}
		</>
	);
}
