import { ReticleLabel } from "@/components/reticle/ReticleLabel";
import { TempleColonnade } from "@/components/three";

/**
 * Section divider with a wireframe colonnade pulling slowly side-to-side.
 * Lives between major page sections to give the page rhythm without resorting
 * to gradient slabs or filler images.
 */
export function TempleDivider() {
	return (
		<div className="relative">
			<TempleColonnade className="h-[180px] w-full md:h-[240px]" />
			<div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-between px-6">
				<ReticleLabel>I.&nbsp;THE RIG</ReticleLabel>
				<ReticleLabel>II.&nbsp;THE RUNTIME</ReticleLabel>
			</div>
		</div>
	);
}
