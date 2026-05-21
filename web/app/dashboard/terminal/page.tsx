import { PageHeader } from "@/components/dashboard/PageHeader";
import { TerminalPanel } from "@/components/dashboard/TerminalPanel";

export const dynamic = "force-dynamic";

export const metadata = {
	title: "Terminal",
};

/**
 * Terminal route.
 *
 * Each prompt issues one POST to `/api/dashboard/exec` which routes
 * through the active provider's execution API. Not a real PTY -- exec is a
 * single-shot RPC, so interactive TTY apps (vim, less, htop) won't
 * work. For everything else (`ls`, `cat`, `tail`, `python -c ...`,
 * `pip install`, `git status`) the experience matches an SSH session
 * closely enough that you don't need to drop into the CLI to inspect
 * the machine.
 */
export default function TerminalPage() {
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="TERMINAL -- /api/dashboard/exec"
				title="Run anything on the machine."
				description="One-shot shell exec on the active machine. Use the command references for /home/machine/.agent-machines, Hermes, OpenClaw, logs, ports, repo checkout, and gateway health. History walks with up/down; Ctrl/Cmd+L clears the scrollback. Interactive TTY apps (vim, less) won't work because exec is single-shot, not a PTY."
			/>
			<div className="px-5 py-5">
				<TerminalPanel />
			</div>
		</div>
	);
}
