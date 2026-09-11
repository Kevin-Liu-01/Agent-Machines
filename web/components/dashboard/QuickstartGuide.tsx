import { ArrowUpRight, Terminal } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/** Read-only entry into the repository CLI; this does not connect to a sandbox. */
export function QuickstartGuide() {
	return (
		<details className={cn("rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg-soft)] p-5")}>
			<summary className={cn("flex cursor-pointer items-center gap-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]")}><Terminal size={18} aria-hidden="true" />Prefer the CLI or SDK?</summary>
			<div className={cn("mt-4 space-y-4")}>
				<p className={cn("max-w-[75ch] text-sm leading-6 text-[var(--ret-text-muted)]")}>The CLI runs from the source repository. Clone it and install dependencies with pnpm, then explore commands without launching compute:</p>
				<pre aria-label="Repository CLI help command" className={cn("overflow-x-auto rounded-md border border-[var(--ret-border)] bg-[var(--ret-bg)] p-4 font-mono text-sm")}><code>pnpm mux help</code></pre>
				<p className={cn("text-sm leading-6 text-[var(--ret-text-muted)]")}>Direct-provider CLI and SDK workflows need credentials in your local environment; dashboard keys are not automatically exported. Creating workspaces or running models can incur provider charges.</p>
				<div className={cn("flex flex-wrap gap-x-5 gap-y-3 text-sm")}>
					<a href="https://github.com/Kevin-Liu-01/Agent-Machines#cli" target="_blank" rel="noreferrer" className={cn("inline-flex items-center gap-1 underline-offset-4 hover:underline")}>Source and CLI guide <ArrowUpRight size={16} aria-hidden="true" /></a>
					<a href="/docs" className={cn("underline-offset-4 hover:underline")}>SDK documentation</a>
					<a href="/dashboard/settings" className={cn("underline-offset-4 hover:underline")}>Manage account credentials</a>
				</div>
			</div>
		</details>
	);
}
