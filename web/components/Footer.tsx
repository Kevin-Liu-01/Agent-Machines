import { BrandMark } from "@/components/BrandMark";
import { Logo } from "@/components/Logo";

export function Footer() {
	return (
		<footer className="flex flex-col gap-4 border-t border-[var(--ret-border)] px-6 py-8 font-mono text-xs text-[var(--ret-text-muted)] md:flex-row md:items-center md:justify-between">
			<div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-5">
				<BrandMark size={18} gap="tight" withLabel={false} />
				<span>hermes-machines . MIT . Reticle / Sigil UI</span>
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
		</footer>
	);
}
