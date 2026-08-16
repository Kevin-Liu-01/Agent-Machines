import { describe, expect, it } from "vitest";

import {
	buildDirectTerminalRelayCommand,
	buildDirectTerminalRelayServiceLaunch,
	DIRECT_TERMINAL_PROTOCOL,
	DIRECT_TERMINAL_RELAY_SOURCE,
} from "./direct-terminal-relay";

describe("direct terminal relay", () => {
	it("ships a worker-local PTY WebSocket with the expected protocol", () => {
		expect(DIRECT_TERMINAL_PROTOCOL).toBe("agent-machines-v1");
		expect(DIRECT_TERMINAL_RELAY_SOURCE).toContain(
			'["tmux", "attach-session", "-t", "amconsole"]',
		);
		expect(DIRECT_TERMINAL_RELAY_SOURCE).toContain("written += os.write");
		expect(DIRECT_TERMINAL_RELAY_SOURCE).toContain(
			'"type": "ack"',
		);
		expect(DIRECT_TERMINAL_RELAY_SOURCE).toContain(
			"except (EOFError, OSError, ValueError):",
		);
	});

	it("builds a detached-safe command with bounded terminal dimensions", () => {
		const command = buildDirectTerminalRelayCommand({
			port: 21_234,
			token: `amt_${"a".repeat(43)}`,
			origin: "https://agentmachines.vercel.app/path",
			cols: 9_999,
			rows: 1,
		});
		expect(command).toContain("'--port' '21234'");
		expect(command).toContain("'--cols' '500' '--rows' '5'");
		expect(command).toContain(
			"'--origin' 'https://agentmachines.vercel.app'",
		);
		expect(command).toContain("base64 -d");
		expect(command).not.toContain("#!/usr/bin/env python3");
	});

	it("preserves the fixed Sprite public service port", () => {
		const command = buildDirectTerminalRelayCommand({
			port: 8_080,
			token: `amt_${"s".repeat(43)}`,
			origin: "https://agentmachines.vercel.app",
			cols: 120,
			rows: 32,
		});
		expect(command).toContain("'--port' '8080'");
		const service = buildDirectTerminalRelayServiceLaunch({
			port: 8_080,
			token: `amt_${"s".repeat(43)}`,
			origin: "https://agentmachines.vercel.app",
			cols: 120,
			rows: 32,
		});
		expect(service.command).toBe("python3");
		expect(service.args).toContain("--persistent-token");
		expect(service.args).toContain("--keep-awake-task");
		expect(service.args).toContain("8080");
	});

	it("rejects a token that could become shell syntax", () => {
		expect(() =>
			buildDirectTerminalRelayCommand({
				port: 21_234,
				token: "amt_bad'; touch /tmp/nope",
				origin: "https://agentmachines.vercel.app",
				cols: 120,
				rows: 32,
			}),
		).toThrow(/safe high-entropy token/);
	});

	it("refuses a non-HTTPS browser origin", () => {
		expect(() =>
			buildDirectTerminalRelayCommand({
				port: 21_234,
				token: `amt_${"b".repeat(43)}`,
				origin: "http://agentmachines.local",
				cols: 120,
				rows: 32,
			}),
		).toThrow(/must use HTTPS/);
	});
});
