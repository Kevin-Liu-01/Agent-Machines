const PREFIX = "agent-machines.dashboard";

function canUseStorage(): boolean {
	return typeof window !== "undefined" && Boolean(window.localStorage);
}

function key(parts: readonly string[]): string {
	return [PREFIX, ...parts].join(":");
}

export function activeGatewayChatKey(machineId: string): string {
	return key(["gateway-chat", machineId]);
}

export function activeAgentConsoleKey(machineId: string): string {
	return key(["agent-console", machineId]);
}

export function readStoredId(storageKey: string | null): string | null {
	if (!storageKey || !canUseStorage()) return null;
	try {
		return window.localStorage.getItem(storageKey);
	} catch {
		return null;
	}
}

export function writeStoredId(storageKey: string | null, value: string | null): void {
	if (!storageKey || !canUseStorage()) return;
	try {
		if (value) {
			window.localStorage.setItem(storageKey, value);
		} else {
			window.localStorage.removeItem(storageKey);
		}
	} catch {
		// Private browsing and disabled storage should not break the console.
	}
}
