import { PublicNavbar } from "@/components/PublicNavbar";
import { Footer } from "@/components/Footer";
import { PublicRegistryBrowser } from "@/components/PublicRegistryBrowser";

export const metadata = {
	title: "Registry — Agent Machines",
	description: "Browse 1000+ skills, MCPs, CLI tools, and plugins for your agent machine.",
};

export default function RegistryPage() {
	return (
		<div className="flex min-h-dvh flex-col bg-[var(--ret-bg)] text-[var(--ret-text)]">
			<PublicNavbar githubRepo="Kevin-Liu-01/agent-machines" />
			<main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12">
				<header className="mb-8">
					<p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[var(--ret-text-muted)]">
						REGISTRY
					</p>
					<h1 className="mt-2 font-mono text-2xl font-medium tracking-tight text-[var(--ret-text)]">
						Browse skills, MCPs, tools, and plugins
					</h1>
					<p className="mt-2 max-w-xl text-sm text-[var(--ret-text-dim)]">
						Search across skills.sh, the official MCP server registry, npm, Cursor plugins, and GitHub repos. Sign in to add items to your machine.
					</p>
				</header>
				<PublicRegistryBrowser />
			</main>
			<Footer />
		</div>
	);
}
