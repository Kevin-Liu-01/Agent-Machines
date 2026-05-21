import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { MachineProvider } from "@/components/dashboard/MachineProvider";
import { isDemoMode } from "@/lib/demo/mode";
import { getUserConfig } from "@/lib/user-config/clerk";
import { DEFAULT_USER_CONFIG, toPublicConfig, type PublicMachineRef } from "@/lib/user-config/schema";

export const dynamic = "force-dynamic";

type Props = {
	children: ReactNode;
	params: Promise<{ machineId: string }>;
};

export default async function MachineLayout({ children, params }: Props) {
	const { machineId } = await params;

	if (isDemoMode()) {
		const persist = await import("@/lib/demo/demo-fleet-persist");
		await persist.hydrateDemoFleetFromCookie();
	}

	let config;
	try {
		config = toPublicConfig(await getUserConfig());
	} catch {
		config = toPublicConfig({ ...DEFAULT_USER_CONFIG });
	}

	let machine: PublicMachineRef | undefined = config.machines.find((m) => m.id === machineId);

	if (!machine && isDemoMode()) {
		const { allDemoMachines } = await import("@/lib/demo/state");
		const demoRef = allDemoMachines().find((m) => m.id === machineId);
		if (demoRef) {
			machine = toPublicConfig({
				...DEFAULT_USER_CONFIG,
				machines: [demoRef],
			}).machines[0];
		}
	}

	if (!machine) notFound();

	const isActive = config.activeMachineId === machineId;

	return (
		<MachineProvider machineId={machineId} machine={machine} isActive={isActive}>
			{children}
		</MachineProvider>
	);
}
