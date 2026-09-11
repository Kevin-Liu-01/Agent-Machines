import { PageHeader } from "@/components/dashboard/PageHeader";
import { TerminalWorkspace } from "@/components/dashboard/TerminalWorkspace";

export const dynamic = "force-dynamic";

export default function MachineTerminalPage() {
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="TERMINAL -- live PTY + one-shot command"
				title="Talk to this machine."
				description="Work in the agent’s terminal, or run a command and inspect its output."
			/>
			<div className="px-4 py-4 sm:px-5 sm:py-5">
				<TerminalWorkspace />
			</div>
		</div>
	);
}
