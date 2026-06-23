const OSC_RGB_RESPONSE =
	/\x1b?\](?:10|11|12);rgb:[0-9a-fA-F]{1,4}\/[0-9a-fA-F]{1,4}\/[0-9a-fA-F]{1,4}(?:\x07|\x1b\\)?/g;

/**
 * xterm answers OSC color queries (for example OSC 11 background-color
 * requests) through the same onData channel as user keystrokes. Those device
 * responses must never be forwarded into tmux as typed shell input.
 */
export function stripTerminalDeviceResponses(data: string): string {
	return data.replace(OSC_RGB_RESPONSE, "");
}

export function isPrintableInput(data: string): boolean {
	if (!data) return false;
	for (const char of data) {
		const code = char.codePointAt(0) ?? 0;
		if (code === 0x1b || code === 0x7f || code < 0x20) return false;
	}
	return true;
}

export function stripSuppressedEcho(
	data: string,
	pendingEcho: string,
): { data: string; pendingEcho: string } {
	if (!data || !pendingEcho) return { data, pendingEcho };
	let matched = 0;
	const limit = Math.min(data.length, pendingEcho.length);
	while (matched < limit && data[matched] === pendingEcho[matched]) {
		matched += 1;
	}

	if (matched === 0) {
		return { data, pendingEcho: "" };
	}

	if (matched < data.length && matched < pendingEcho.length) {
		return { data, pendingEcho: "" };
	}

	return {
		data: data.slice(matched),
		pendingEcho: pendingEcho.slice(matched),
	};
}
