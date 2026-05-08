import { BrandMark } from "@/components/BrandMark";
import { Logo } from "@/components/Logo";
import { ReticleCross } from "@/components/reticle/ReticleCross";
import { ReticleHatch } from "@/components/reticle/ReticleHatch";

export function Footer() {
	return (
		<footer className="relative border-t border-[var(--ret-border)] font-mono text-xs text-[var(--ret-text-muted)]">
			{/* Corner crosses where the rails meet the footer's top border.
			    Offset by the full crossArm (10px) so the SVG's center is
			    pinned on the intersection rather than 5px off it. */}
			<ReticleCross
				className="absolute z-20"
				style={{
					top: "-10px",
					left: "calc(var(--ret-rail-offset) - 10px)",
				}}
			/>
			<ReticleCross
				className="absolute z-20"
				style={{
					top: "-10px",
					right: "calc(var(--ret-rail-offset) - 10px)",
				}}
			/>
			<ReticleHatch className="h-4 w-full border-b border-[var(--ret-border)]" />
			<div className="mx-auto max-w-[var(--ret-content-max)]">
				<div className="flex flex-col gap-4 px-6 py-8 md:flex-row md:items-center md:justify-between">
					<div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-5">
						<BrandMark size={18} gap="tight" withLabel={false} />
						<span>agent-machines . MIT . Reticle / Sigil UI</span>
						<span className="hidden items-center gap-2 text-[var(--ret-text-muted)] md:flex">
							<span>built with</span>
							<a
								href="https://docs.dedaluslabs.ai/dcs"
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 hover:text-[var(--ret-text)]"
							>
								<Logo mark="dedalus" size={14} />
								<span>Dedalus</span>
							</a>
							<span>+</span>
							<a
								href="https://nousresearch.com/"
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 hover:text-[var(--ret-text)]"
							>
								<Logo mark="nous" size={14} />
								<span>Nous</span>
							</a>
							<span>+</span>
							<a
								href="https://cursor.com/"
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 hover:text-[var(--ret-text)]"
							>
								<Logo mark="cursor" size={14} />
								<span>Cursor</span>
							</a>
						</span>
					</div>
					<span className="flex items-center gap-3">
						<a
							href="https://github.com/Kevin-Liu-01/hermes-machines"
							className="hover:text-[var(--ret-text)]"
							target="_blank"
							rel="noreferrer"
						>
							github
						</a>
						<a
							href="https://hermes-agent.nousresearch.com/docs/"
							className="hover:text-[var(--ret-text)]"
							target="_blank"
							rel="noreferrer"
						>
							hermes docs
						</a>
						<a
							href="https://docs.dedaluslabs.ai/dcs"
							className="hover:text-[var(--ret-text)]"
							target="_blank"
							rel="noreferrer"
						>
							dcs
						</a>
					</span>
				</div>
			</div>
		</footer>
	);
}
