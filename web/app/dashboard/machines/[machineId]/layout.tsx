import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { MachineProvider } from "@/components/dashboard/MachineProvider";
import { getUserConfig } from "@/lib/user-config/clerk";
import { DEFAULT_USER_CONFIG, toPublicConfig } from "@/lib/user-config/schema";

type Props = {
	children: ReactNode;
	params: Promise<{ machineId: string }>;
};

export default async function MachineLayout({ children, params }: Props) {
	const { machineId } = await params;

	let config;
	try {
		config = toPublicConfig(await getUserConfig());
	} catch {
		config = toPublicConfig({ ...DEFAULT_USER_CONFIG });
	}

	const machine = config.machines.find((m) => m.id === machineId);
	if (!machine) notFound();

	return (
		<MachineProvider machineId={machineId} machine={machine}>
			{children}
		</MachineProvider>
	);
}
