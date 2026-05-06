"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * Procedural wireframe Hermes bust. No GLTF download, no asset CDN -- the
 * silhouette is composed from displaced primitives:
 *   - Icosphere with vertex noise for the head
 *   - Truncated cone for the neck
 *   - Stacked tori suggesting a draped collar
 *   - Cylindrical pedestal
 * Rotates slowly on the Y axis. Wireframe color reads from the
 * `--ret-purple` token so it tracks light/dark theme automatically.
 */
function readPurple(): string {
	if (typeof window === "undefined") return "#AAA5E6";
	const v = getComputedStyle(document.documentElement)
		.getPropertyValue("--ret-purple")
		.trim();
	return v || "#AAA5E6";
}

function makeHeadGeometry(): THREE.BufferGeometry {
	// IcosahedronGeometry with detail=2 (~80 triangles) gives a low-poly head
	// that reads as classical/sculptural rather than rounded.
	const g = new THREE.IcosahedronGeometry(1, 2);
	const pos = g.attributes.position as THREE.BufferAttribute;
	const v = new THREE.Vector3();
	for (let i = 0; i < pos.count; i++) {
		v.fromBufferAttribute(pos, i);
		// Stretch vertically + asymmetric noise to avoid feeling like a sphere.
		const yShift = v.y * 0.18;
		const noise = Math.sin(v.x * 4) * Math.cos(v.z * 4) * 0.06;
		v.multiplyScalar(1 + yShift + noise);
		// Carve a faint nose ridge along +z so the silhouette has a face.
		if (v.z > 0.7 && Math.abs(v.y) < 0.2) {
			v.z += 0.18;
		}
		pos.setXYZ(i, v.x, v.y, v.z);
	}
	g.computeVertexNormals();
	return g;
}

export function HermesBust() {
	const group = useRef<THREE.Group>(null);
	const head = useMemo(makeHeadGeometry, []);
	const purple = useMemo(readPurple, []);

	useFrame((_state, delta) => {
		if (!group.current) return;
		group.current.rotation.y += delta * 0.18;
		group.current.rotation.x = Math.sin(_state.clock.elapsedTime * 0.3) * 0.04;
	});

	const lineMat = (
		<lineBasicMaterial color={purple} transparent opacity={0.85} />
	);

	return (
		<group ref={group} position={[0, -0.2, 0]} scale={1.05}>
			{/* Head */}
			<group position={[0, 1.05, 0]}>
				<lineSegments>
					<wireframeGeometry args={[head]} />
					{lineMat}
				</lineSegments>
				{/* Subtle inner solid shell at very low opacity for depth perception */}
				<mesh geometry={head}>
					<meshBasicMaterial
						color={purple}
						transparent
						opacity={0.04}
						depthWrite={false}
					/>
				</mesh>
			</group>

			{/* Neck */}
			<group position={[0, 0.05, 0]}>
				<lineSegments>
					<wireframeGeometry
						args={[new THREE.CylinderGeometry(0.45, 0.55, 0.55, 12, 2)]}
					/>
					{lineMat}
				</lineSegments>
			</group>

			{/* Collar / draped shoulders, two stacked tori */}
			{[0, 1].map((i) => (
				<group key={i} position={[0, -0.25 - i * 0.18, 0]}>
					<lineSegments>
						<wireframeGeometry
							args={[
								new THREE.TorusGeometry(0.85 + i * 0.12, 0.16, 8, 24),
							]}
						/>
						{lineMat}
					</lineSegments>
				</group>
			))}

			{/* Pedestal */}
			<group position={[0, -0.85, 0]}>
				<lineSegments>
					<wireframeGeometry
						args={[new THREE.CylinderGeometry(0.7, 0.85, 0.45, 8, 1)]}
					/>
					{lineMat}
				</lineSegments>
				<lineSegments position={[0, -0.27, 0]}>
					<wireframeGeometry
						args={[new THREE.BoxGeometry(1.85, 0.18, 1.85)]}
					/>
					{lineMat}
				</lineSegments>
			</group>

			{/* Decorative cross marks at structural intersections, evoking the Reticle aesthetic */}
			{[
				[0, 1.95, 0],
				[0, -1.15, 0],
				[1.5, -0.85, 0],
				[-1.5, -0.85, 0],
			].map(([x, y, z], i) => (
				<group key={`x${i}`} position={[x, y, z]}>
					<lineSegments>
						<bufferGeometry>
							<bufferAttribute
								attach="attributes-position"
								args={[
									new Float32Array([
										-0.08, 0, 0, 0.08, 0, 0, 0, -0.08, 0, 0, 0.08, 0, 0, 0,
										-0.08, 0, 0, 0.08,
									]),
									3,
								]}
							/>
						</bufferGeometry>
						<lineBasicMaterial color={purple} opacity={0.5} transparent />
					</lineSegments>
				</group>
			))}
		</group>
	);
}
