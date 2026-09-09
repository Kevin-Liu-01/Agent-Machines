/** Hosted tenant binding; all Daytona SDK calls live in the shared adapter. */
import { createDaytonaProvider } from "agent-machines/mux/providers/daytona";
import type { ProviderCredentials } from "@/lib/user-config/schema";
import { credentialScope, createMuxBackedProvider, requireNoWake, toMuxDescription } from "./mux-facade";
import type { MachineProvider } from "./types";

export function createHostedDaytonaProvider(creds: NonNullable<ProviderCredentials["daytona"]>): MachineProvider {
	const provider = createDaytonaProvider({ apiKey: creds.apiKey, apiUrl: creds.apiUrl, target: creds.target });
	requireNoWake("daytona", "describe", provider.describe);
	requireNoWake("daytona", "park", provider.park);
	requireNoWake("daytona", "remove", provider.remove);
	return createMuxBackedProvider({
		kind: "daytona",
		substrate: provider,
		cacheScope: credentialScope([creds.apiKey, creds.apiUrl, creds.target]),
		describe: async (id) => toMuxDescription(await provider.describe!(id)),
		park: (id) => provider.park!(id),
		remove: (id) => provider.remove!(id),
		createOptions: (input) => ({
			name: input.name,
			env: { AGENT_KIND: input.agentKind ?? "hermes", AGENT_MODEL: input.model ?? "", ...(input.env ?? {}), HOME: "/home/daytona" },
			resources: { vcpu: input.spec?.vcpu, memoryMib: input.spec?.memoryMib, diskGib: input.spec?.storageGib },
		}),
		trimOutput: false,
	});
}
