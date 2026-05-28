import type { ProviderKind } from "@/lib/user-config/schema";

export function machineHomeForProvider(providerKind: ProviderKind): string {
	if (providerKind === "e2b") return "/home/user";
	if (providerKind === "sprites") return "/home/sprite";
	if (providerKind === "vercel") return "/vercel/sandbox";
	return "/home/machine";
}

export function bootstrapLogPath(providerKind: ProviderKind): string {
	const home = machineHomeForProvider(providerKind);
	return `${home}/.agent-machines/logs/bootstrap.log`;
}

export function wrapPhaseCommand(
	phase: string,
	command: string,
	logPath: string,
): string {
	return `
mkdir -p "$(dirname ${logPath})"
echo "--- phase: ${phase} $(date -Iseconds 2>/dev/null || date) ---" >> ${logPath}
(
  ${command}
) >> ${logPath} 2>&1
rc=$?
echo "--- phase ${phase} exit $rc ---" >> ${logPath}
exit $rc
`.trim();
}
