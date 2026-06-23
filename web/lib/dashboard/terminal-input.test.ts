import { describe, expect, it } from "vitest";

import {
	isPrintableInput,
	stripSuppressedEcho,
	stripTerminalDeviceResponses,
} from "./terminal-input";

describe("stripTerminalDeviceResponses", () => {
	it("drops xterm OSC color responses before they reach tmux input", () => {
		expect(
			stripTerminalDeviceResponses("\x1b]11;rgb:0a0a/0a0a/0e0e\x1b\\"),
		).toBe("");
		expect(stripTerminalDeviceResponses("]11;rgb:0a0a/0a0a/0e0e")).toBe("");
	});

	it("keeps real user input around stripped device responses", () => {
		expect(
			stripTerminalDeviceResponses(
				"echo ok\x1b]11;rgb:0a0a/0a0a/0e0e\x1b\\\r",
			),
		).toBe("echo ok\r");
	});
});

describe("isPrintableInput", () => {
	it("distinguishes printable text from control sequences", () => {
		expect(isPrintableInput("hello")).toBe(true);
		expect(isPrintableInput("é")).toBe(true);
		expect(isPrintableInput("\r")).toBe(false);
		expect(isPrintableInput("\x1b[A")).toBe(false);
		expect(isPrintableInput("\x7f")).toBe(false);
	});
});

describe("stripSuppressedEcho", () => {
	it("removes the remote echo for an optimistic line", () => {
		expect(stripSuppressedEcho("ls\r\nfile.txt\r\n", "ls\r\n")).toEqual({
			data: "file.txt\r\n",
			pendingEcho: "",
		});
	});

	it("carries partial echo suppression across chunks", () => {
		expect(stripSuppressedEcho("ec", "echo ok\r\n")).toEqual({
			data: "",
			pendingEcho: "ho ok\r\n",
		});
	});

	it("abandons suppression on mismatch so output is not eaten", () => {
		expect(stripSuppressedEcho("error\r\n", "echo ok\r\n")).toEqual({
			data: "error\r\n",
			pendingEcho: "",
		});
	});
});
