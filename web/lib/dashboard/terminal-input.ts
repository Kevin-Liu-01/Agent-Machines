const OSC_RGB_RESPONSE =
	/\x1b?\](?:10|11|12);rgb:[0-9a-fA-F]{1,4}\/[0-9a-fA-F]{1,4}\/[0-9a-fA-F]{1,4}(?:\x07|\x1b\\)?/g;

const CSI_DEVICE_RESPONSE =
	/^\x1b\[(?:[?>]?[0-9;]*c|\??[0-9;]+;[0-4]\$y|\??[0-9;]*(?:n|R)|[468];[0-9]+;[0-9]+t|[IO])$/;
const OSC_COLOR_RESPONSE =
	/^\x1b\](?:(?:4;[0-9]+)|10|11|12);rgb:[0-9a-fA-F]{1,4}\/[0-9a-fA-F]{1,4}\/[0-9a-fA-F]{1,4}(?:\x07|\x1b\\)$/;
const DCS_STATUS_RESPONSE = /^\x1bP[\s\S]*\x1b\\$/;

/**
 * xterm emits terminal protocol replies through onData, the same public event
 * used for keystrokes. These replies must be returned to the PTY that emitted
 * the query instead of entering the browser's local line editor.
 */
export function isTerminalDeviceResponse(data: string): boolean {
	return (
		CSI_DEVICE_RESPONSE.test(data) ||
		OSC_COLOR_RESPONSE.test(data) ||
		DCS_STATUS_RESPONSE.test(data)
	);
}

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
