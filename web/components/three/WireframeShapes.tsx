"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

function readPurple(): string {
	if (typeof window === "undefined") return "#AAA5E6";
	const v = getComputedStyle(document.documentElement)
		.getPropertyValue("--ret-purple")
		.trim();
	return v || "#AAA5E6";
}

function WireMat({ color, opacity = 0.6 }: { color: string; opacity?: number }) {
	return <lineBasicMaterial color={color} transparent opacity={opacity} />;
}

/* ------------------------------------------------------------------ */
/* 01 Dashboard: wide flat monitor frame + inner panel                 */
/* ------------------------------------------------------------------ */

export function DashboardWire() {
	const ref = useRef<THREE.Group>(null);
	const purple = useMemo(readPurple, []);
	const outer = useMemo(() => new THREE.BoxGeometry(2.2, 1.4, 0.2), []);
	const inner = useMemo(() => new THREE.BoxGeometry(1.8, 1.0, 0.1), []);
	const stand = useMemo(() => new THREE.BoxGeometry(0.3, 0.5, 0.15), []);

	useFrame((_, delta) => {
		if (ref.current) ref.current.rotation.y += delta * 0.12;
	});

	return (
		<group ref={ref} position={[0, 0.1, 0]}>
			<lineSegments>
				<wireframeGeometry args={[outer]} />
				<WireMat color={purple} />
			</lineSegments>
			<lineSegments position={[0, 0, 0.06]}>
				<wireframeGeometry args={[inner]} />
				<WireMat color={purple} opacity={0.35} />
			</lineSegments>
			<lineSegments position={[0, -0.95, 0]}>
				<wireframeGeometry args={[stand]} />
				<WireMat color={purple} opacity={0.4} />
			</lineSegments>
		</group>
	);
}

/* ------------------------------------------------------------------ */
/* 02 Agent: dodecahedron gem core                                     */
/* ------------------------------------------------------------------ */

export function AgentWire() {
	const ref = useRef<THREE.Group>(null);
	const purple = useMemo(readPurple, []);
	const geom = useMemo(() => new THREE.DodecahedronGeometry(1.1, 0), []);
	const ring = useMemo(() => new THREE.TorusGeometry(1.4, 0.02, 6, 24), []);

	useFrame((_, delta) => {
		if (ref.current) {
			ref.current.rotation.y += delta * 0.18;
			ref.current.rotation.x += delta * 0.04;
		}
	});

	return (
		<group ref={ref}>
			<lineSegments>
				<wireframeGeometry args={[geom]} />
				<WireMat color={purple} />
			</lineSegments>
			<lineSegments rotation={[Math.PI / 2, 0, 0]}>
				<wireframeGeometry args={[ring]} />
				<WireMat color={purple} opacity={0.3} />
			</lineSegments>
		</group>
	);
}

/* ------------------------------------------------------------------ */
/* 03 Loadout: 4 connected octahedron nodes                            */
/* ------------------------------------------------------------------ */

const NODE_POSITIONS: [number, number, number][] = [
	[-0.8, 0.6, 0],
	[0.8, 0.6, 0],
	[-0.5, -0.6, 0.3],
	[0.7, -0.5, -0.2],
];

export function LoadoutWire() {
	const ref = useRef<THREE.Group>(null);
	const purple = useMemo(readPurple, []);
	const nodeGeom = useMemo(() => new THREE.OctahedronGeometry(0.35, 0), []);

	const linePoints = useMemo(() => {
		const pts: THREE.Vector3[] = [];
		for (let i = 0; i < NODE_POSITIONS.length; i++) {
			for (let j = i + 1; j < NODE_POSITIONS.length; j++) {
				pts.push(
					new THREE.Vector3(...NODE_POSITIONS[i]),
					new THREE.Vector3(...NODE_POSITIONS[j]),
				);
			}
		}
		const geom = new THREE.BufferGeometry();
		geom.setFromPoints(pts);
		return geom;
	}, []);

	useFrame((_, delta) => {
		if (ref.current) ref.current.rotation.y += delta * 0.14;
	});

	return (
		<group ref={ref}>
			{NODE_POSITIONS.map((pos, i) => (
				<lineSegments key={i} position={pos}>
					<wireframeGeometry args={[nodeGeom]} />
					<WireMat color={purple} opacity={0.7} />
				</lineSegments>
			))}
			<lineSegments geometry={linePoints}>
				<WireMat color={purple} opacity={0.25} />
			</lineSegments>
		</group>
	);
}

/* ------------------------------------------------------------------ */
/* 04 Hosts: stacked server rack boxes                                 */
/* ------------------------------------------------------------------ */

export function HostsWire() {
	const ref = useRef<THREE.Group>(null);
	const purple = useMemo(readPurple, []);
	const box = useMemo(() => new THREE.BoxGeometry(1.8, 0.45, 0.9), []);

	useFrame((_, delta) => {
		if (ref.current) ref.current.rotation.y += delta * 0.1;
	});

	return (
		<group ref={ref}>
			{[-0.7, 0, 0.7].map((y, i) => (
				<lineSegments key={i} position={[0, y, 0]}>
					<wireframeGeometry args={[box]} />
					<WireMat color={purple} opacity={0.5 + i * 0.15} />
				</lineSegments>
			))}
			{/* Vertical rails */}
			{[-0.85, 0.85].map((x) => (
				<lineSegments key={x} position={[x, 0, 0.4]}>
					<wireframeGeometry args={[new THREE.BoxGeometry(0.06, 1.8, 0.06)]} />
					<WireMat color={purple} opacity={0.3} />
				</lineSegments>
			))}
		</group>
	);
}

/* ------------------------------------------------------------------ */
/* 05 Environment: nested icosahedron shells                           */
/* ------------------------------------------------------------------ */

export function EnvironmentWire() {
	const ref = useRef<THREE.Group>(null);
	const purple = useMemo(readPurple, []);
	const inner = useMemo(() => new THREE.IcosahedronGeometry(0.7, 1), []);
	const outer = useMemo(() => new THREE.IcosahedronGeometry(1.3, 0), []);

	useFrame((_, delta) => {
		if (ref.current) {
			ref.current.rotation.y += delta * 0.15;
			ref.current.rotation.z += delta * 0.03;
		}
	});

	return (
		<group ref={ref}>
			<lineSegments>
				<wireframeGeometry args={[inner]} />
				<WireMat color={purple} opacity={0.65} />
			</lineSegments>
			<lineSegments>
				<wireframeGeometry args={[outer]} />
				<WireMat color={purple} opacity={0.25} />
			</lineSegments>
		</group>
	);
}

/* ------------------------------------------------------------------ */
/* Machine: torus knot for StickyRuntimeStory                          */
/* ------------------------------------------------------------------ */

export function MachineWire() {
	const ref = useRef<THREE.Group>(null);
	const purple = useMemo(readPurple, []);
	const geom = useMemo(() => new THREE.TorusKnotGeometry(0.9, 0.3, 80, 12, 2, 3), []);

	useFrame((_, delta) => {
		if (ref.current) {
			ref.current.rotation.y += delta * 0.08;
			ref.current.rotation.x += delta * 0.02;
		}
	});

	return (
		<group ref={ref}>
			<lineSegments>
				<wireframeGeometry args={[geom]} />
				<WireMat color={purple} opacity={0.55} />
			</lineSegments>
		</group>
	);
}
