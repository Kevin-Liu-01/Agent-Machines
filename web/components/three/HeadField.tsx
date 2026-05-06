"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * Three small wireframe heads floating on a row, each rotating at a slightly
 * different rate. Used as a section divider / decorative element. Same
 * head-shape carving as HermesBust but smaller and arranged as a triptych.
 */
function readPurple(): string {
	if (typeof window === "undefined") return "#AAA5E6";
	const v = getComputedStyle(document.documentElement)
		.getPropertyValue("--ret-purple")
		.trim();
	return v || "#AAA5E6";
}

function makeHead(seed: number): THREE.BufferGeometry {
	const g = new THREE.IcosahedronGeometry(0.7, 2);
	const pos = g.attributes.position as THREE.BufferAttribute;
	const v = new THREE.Vector3();
	for (let i = 0; i < pos.count; i++) {
		v.fromBufferAttribute(pos, i);
		const yShift = v.y * 0.22;
		const noise = Math.sin(v.x * 4 + seed) * Math.cos(v.z * 4 + seed) * 0.07;
		v.multiplyScalar(1 + yShift + noise);
		if (v.z > 0.5 && Math.abs(v.y) < 0.18) v.z += 0.16;
		pos.setXYZ(i, v.x, v.y, v.z);
	}
	g.computeVertexNormals();
	return g;
}

function Head({
	x,
	seed,
	rotationRate,
}: {
	x: number;
	seed: number;
	rotationRate: number;
}) {
	const ref = useRef<THREE.Group>(null);
	const geom = useMemo(() => makeHead(seed), [seed]);
	const purple = useMemo(readPurple, []);

	useFrame((_, delta) => {
		if (!ref.current) return;
		ref.current.rotation.y += delta * rotationRate;
	});

	return (
		<group ref={ref} position={[x, 0, 0]}>
			<lineSegments>
				<wireframeGeometry args={[geom]} />
				<lineBasicMaterial color={purple} transparent opacity={0.75} />
			</lineSegments>
		</group>
	);
}

export function HeadField() {
	return (
		<>
			<Head x={-1.8} seed={1} rotationRate={0.22} />
			<Head x={0} seed={2.7} rotationRate={-0.15} />
			<Head x={1.8} seed={4.1} rotationRate={0.28} />
		</>
	);
}
