import { BrandMark } from "@/components/BrandMark";
import { Logo } from "@/components/Logo";

export function Footer() {
	return (
		<footer className="relative text-xs text-[var(--ret-text-muted)]">
			<div className="mx-auto w-full max-w-[var(--ret-content-max)]">
				<div className="flex flex-col gap-4 px-6 py-8 md:flex-row md:items-center md:justify-between">
					<div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-5">
						<BrandMark size={18} gap="tight" withLabel={false} />
						<span>agent-machines . MIT . Reticle / Sigil UI</span>
						<span className="hidden items-center gap-2 text-[var(--ret-text-muted)] md:flex">
							<span>runtime stack:</span>
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
								href="https://github.com/NousResearch/hermes-agent"
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 hover:text-[var(--ret-text)]"
							>
								<Logo mark="nous" size={14} />
								<span>Hermes</span>
							</a>
							<span>/</span>
							<a
								href="https://github.com/openclaw/openclaw"
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 hover:text-[var(--ret-text)]"
							>
								<Logo mark="openclaw" size={14} />
								<span>OpenClaw</span>
							</a>
							<span>+ tools</span>
						</span>
					</div>
					<span className="flex flex-wrap items-center gap-3">
						<a
							href="https://github.com/Kevin-Liu-01/agent-machines"
							className="hover:text-[var(--ret-text)]"
							target="_blank"
							rel="noreferrer"
						>
							github
						</a>
						<a href="/faq" className="hover:text-[var(--ret-text)]">
							faq
						</a>
						<a href="/terms" className="hover:text-[var(--ret-text)]">
							terms
						</a>
						<a href="/privacy" className="hover:text-[var(--ret-text)]">
							privacy
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
