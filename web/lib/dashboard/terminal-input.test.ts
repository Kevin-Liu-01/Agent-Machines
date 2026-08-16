import { describe, expect, it } from "vitest";

import {
	isPrintableInput,
	isTerminalDeviceResponse,
	stripSuppressedEcho,
	stripTerminalDeviceResponses,
} from "./terminal-input";

describe("isTerminalDeviceResponse", () => {
	it("recognizes xterm's DA2 reply that must retain PTY affinity", () => {
		expect(isTerminalDeviceResponse("\x1b[>0;276;0c")).toBe(true);
	});

	it("recognizes the terminal reports xterm emits through onData", () => {
		for (const response of [
			"\x1b[?1;2c",
			"\x1b[0n",
			"\x1b[12;40R",
			"\x1b[?12;40R",
			"\x1b[?2004;1$y",
			"\x1b[8;32;120t",
			"\x1b[I",
			"\x1b[O",
			"\x1b]11;rgb:0a0a/0a0a/0e0e\x1b\\",
			"\x1bP1$r0m\x1b\\",
		]) {
			expect(isTerminalDeviceResponse(response)).toBe(true);
		}
	});

	it("does not confuse keyboard input with terminal replies", () => {
		for (const input of ["echo ok", "\x1b[A", "\x1b[D", "\r", ">0;276;0c"]) {
			expect(isTerminalDeviceResponse(input)).toBe(false);
		}
	});
});

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
