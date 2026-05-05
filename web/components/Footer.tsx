export function Footer() {
	return (
		<footer className="flex flex-col gap-2 px-6 py-8 font-mono text-xs text-[var(--ret-text-muted)] md:flex-row md:items-center md:justify-between">
			<span>hermes-rig · MIT · Reticle / Sigil UI</span>
			<span className="flex items-center gap-3">
				<a
					href="https://github.com/Kevin-Liu-01/hermes-rig"
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
