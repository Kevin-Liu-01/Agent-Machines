import { PageHeader } from "@/components/dashboard/PageHeader";
import { TerminalWorkspace } from "@/components/dashboard/TerminalWorkspace";

export const dynamic = "force-dynamic";

export default function MachineTerminalPage() {
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="TERMINAL -- live PTY + one-shot exec"
				title="Talk to this machine."
				description="Interactive mode attaches a real tmux PTY over the streaming gateway — type, run the agent CLI, and interact as if you were SSH'd in. One-shot mode fires single commands with streamed output."
			/>
			<div className="px-5 py-5">
				<TerminalWorkspace />
			</div>
		</div>
	);
}
