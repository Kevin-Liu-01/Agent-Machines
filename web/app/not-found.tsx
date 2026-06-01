import { ReticleButton } from "@/components/reticle/ReticleButton";
import { SchematicPanel } from "@/components/reticle/SchematicPanel";
import { ERROR_ART } from "@/lib/dashboard/category-art";

/**
 * Global 404. Framed schematic graphic (recipe B) keeps the missing-route
 * page on-brand and intentional in both themes.
 */
export default function NotFound() {
	return (
		<main className="flex min-h-[100dvh] items-center justify-center bg-[var(--ret-bg)] px-6 py-16 text-[var(--ret-text)]">
			<div className="w-full max-w-md text-center">
				<SchematicPanel
					src={ERROR_ART.notFound}
					className="mx-auto mb-8 w-full max-w-sm"
				/>
				<p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
					Error 404
				</p>
				<h1 className="ret-display mt-2 text-2xl">This route went missing</h1>
				<p className="mx-auto mt-3 max-w-[46ch] text-sm leading-relaxed text-[var(--ret-text-dim)]">
					The page you&apos;re looking for isn&apos;t on any machine. Check the
					address, or head back to the fleet.
				</p>
				<div className="mt-6 flex flex-wrap items-center justify-center gap-2">
					<ReticleButton as="a" href="/dashboard" variant="primary" size="sm">
						Go to dashboard
					</ReticleButton>
					<ReticleButton as="a" href="/" variant="secondary" size="sm">
						Home
					</ReticleButton>
				</div>
			</div>
		</main>
	);
}
