import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { MachineProvider } from "@/components/dashboard/MachineProvider";
import { getUserConfig } from "@/lib/user-config/clerk";
import { DEFAULT_USER_CONFIG, toPublicConfig, type PublicMachineRef } from "@/lib/user-config/schema";

export const dynamic = "force-dynamic";

type Props = {
	children: ReactNode;
	params: Promise<{ machineId: string }>;
};

export default async function MachineLayout({ children, params }: Props) {
	const { machineId } = await params;

	let machine: PublicMachineRef | undefined;
	let isActive = false;

	let config;
	try {
		config = toPublicConfig(await getUserConfig());
	} catch {
		config = toPublicConfig({ ...DEFAULT_USER_CONFIG });
	}
	machine = config.machines.find((m) => m.id === machineId);
	isActive = config.activeMachineId === machineId;

	if (!machine) notFound();

	return (
		<MachineProvider machineId={machineId} machine={machine} isActive={isActive}>
			{children}
		</MachineProvider>
	);
}
