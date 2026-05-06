"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * Wireframe colonnade rendered as a side-scroll element. Five Doric-ish
 * columns spaced along the X axis with a continuous architrave above. The
 * camera pans slowly across the row so the columns feel like they're walking
 * past, suggesting motion without rotating individual elements.
 */
function readColors(): { primary: string; dim: string } {
	if (typeof window === "undefined") {
		return { primary: "#AAA5E6", dim: "rgba(0,0,0,0.30)" };
	}
	const cs = getComputedStyle(document.documentElement);
	return {
		primary: cs.getPropertyValue("--ret-purple").trim() || "#AAA5E6",
		dim: cs.getPropertyValue("--ret-cross").trim() || "rgba(0,0,0,0.30)",
	};
}

function Column({ x }: { x: number }) {
	const cap = useMemo(() => new THREE.BoxGeometry(0.9, 0.18, 0.9), []);
	const shaft = useMemo(
		() => new THREE.CylinderGeometry(0.32, 0.36, 2.6, 16, 4),
		[],
	);
	const base = useMemo(() => new THREE.BoxGeometry(1.0, 0.22, 1.0), []);
	const colors = useMemo(readColors, []);

	const lineMat = <lineBasicMaterial color={colors.primary} transparent opacity={0.7} />;

	return (
		<group position={[x, 0, 0]}>
			<lineSegments position={[0, 1.5, 0]}>
				<wireframeGeometry args={[cap]} />
				{lineMat}
			</lineSegments>
			<lineSegments position={[0, 0.1, 0]}>
				<wireframeGeometry args={[shaft]} />
				{lineMat}
			</lineSegments>
			<lineSegments position={[0, -1.3, 0]}>
				<wireframeGeometry args={[base]} />
				{lineMat}
			</lineSegments>
		</group>
	);
}

function Architrave({ width }: { width: number }) {
	const beam = useMemo(() => new THREE.BoxGeometry(width, 0.3, 0.85), []);
	const colors = useMemo(readColors, []);
	return (
		<lineSegments position={[0, 1.85, 0]}>
			<wireframeGeometry args={[beam]} />
			<lineBasicMaterial color={colors.primary} transparent opacity={0.55} />
		</lineSegments>
	);
}

export function TempleScene() {
	const group = useRef<THREE.Group>(null);
	const positions = useMemo(() => [-3, -1.5, 0, 1.5, 3], []);

	useFrame((state) => {
		if (!group.current) return;
		// Slow horizontal drift, easing in and out so the colonnade feels alive
		// without ever fully scrolling off-screen.
		group.current.position.x = Math.sin(state.clock.elapsedTime * 0.15) * 0.4;
		group.current.rotation.y =
			Math.sin(state.clock.elapsedTime * 0.07) * 0.06;
	});

	return (
		<group ref={group} position={[0, -0.2, 0]} scale={0.9}>
			<Architrave width={6.6} />
			{positions.map((x, i) => (
				<Column key={i} x={x} />
			))}
		</group>
	);
}
