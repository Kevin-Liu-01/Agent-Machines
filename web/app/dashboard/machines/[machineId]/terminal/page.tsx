import { PageHeader } from "@/components/dashboard/PageHeader";
import { TerminalPanel } from "@/components/dashboard/TerminalPanel";

export const dynamic = "force-dynamic";

export default function MachineTerminalPage() {
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="TERMINAL -- /api/dashboard/exec"
				title="Run anything on this machine."
				description="One-shot shell exec on this machine. Use the command references for /home/machine/.agent-machines, Hermes, OpenClaw, logs, ports, repo checkout, and gateway health."
			/>
			<div className="px-5 py-5">
				<TerminalPanel />
			</div>
		</div>
	);
}
