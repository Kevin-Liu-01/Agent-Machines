import { describe, expect, it } from "vitest";

import {
	CONSOLE_LOG,
	CONSOLE_SESSION,
	clampDim,
	ensureSessionCommand,
	resizeCommand,
	sendKeysCommand,
	toHexKeys,
} from "./terminal-session";

describe("toHexKeys", () => {
	it("encodes printable text as space-separated hex byte pairs", () => {
		expect(toHexKeys("hi")).toBe("68 69");
		expect(toHexKeys("echo ok")).toBe("65 63 68 6f 20 6f 6b");
	});

	it("encodes control bytes (Enter, Ctrl-C, Tab)", () => {
		expect(toHexKeys("\r")).toBe("0d");
		expect(toHexKeys("\n")).toBe("0a");
		expect(toHexKeys("\u0003")).toBe("03"); // Ctrl-C
		expect(toHexKeys("\t")).toBe("09");
	});

	it("encodes escape sequences (arrow up) and multibyte UTF-8", () => {
		expect(toHexKeys("\u001b[A")).toBe("1b 5b 41"); // ESC [ A
		expect(toHexKeys("\u00e9")).toBe("c3 a9"); // é -> 2 UTF-8 bytes
	});

	it("returns empty string for empty input", () => {
		expect(toHexKeys("")).toBe("");
	});
});

describe("sendKeysCommand", () => {
	it("builds a tmux send-keys -H command targeting the console session", () => {
		expect(sendKeysCommand("hi")).toBe(
			`tmux send-keys -t ${CONSOLE_SESSION} -H 68 69`,
		);
	});

	it("is a no-op for empty input", () => {
		expect(sendKeysCommand("")).toBe(":");
	});
});

describe("ensureSessionCommand", () => {
	it("creates the session idempotently and pipes the pane to the log", () => {
		const cmd = ensureSessionCommand(120, 32);
		expect(cmd).toContain(`tmux has-session -t ${CONSOLE_SESSION}`);
		expect(cmd).toContain(`tmux new-session -d -s ${CONSOLE_SESSION} -x 120 -y 32`);
		expect(cmd).toContain(`tmux pipe-pane -t ${CONSOLE_SESSION} -o 'cat >> ${CONSOLE_LOG}'`);
		expect(cmd).toContain("AM_CONSOLE_READY");
		expect(cmd).toContain("apt-get install -y tmux");
	});

	it("clamps absurd dimensions to safe bounds", () => {
		const cmd = ensureSessionCommand(99999, 0);
		expect(cmd).toContain("-x 500 -y 5");
	});
});

describe("resizeCommand", () => {
	it("resizes the window with a resize-pane fallback", () => {
		const cmd = resizeCommand(80, 24);
		expect(cmd).toContain(`tmux resize-window -t ${CONSOLE_SESSION} -x 80 -y 24`);
		expect(cmd).toContain(`tmux resize-pane -t ${CONSOLE_SESSION} -x 80 -y 24`);
	});
});

describe("clampDim", () => {
	it("clamps, floors, and falls back on non-numbers", () => {
		expect(clampDim(50, 20, 500, 120)).toBe(50);
		expect(clampDim(5, 20, 500, 120)).toBe(20);
		expect(clampDim(9999, 20, 500, 120)).toBe(500);
		expect(clampDim("nope", 20, 500, 120)).toBe(120);
		expect(clampDim(40.9, 20, 500, 120)).toBe(40);
	});
});
