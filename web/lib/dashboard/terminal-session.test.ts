import { describe, expect, it, vi } from "vitest";

import {
	CONSOLE_LOG,
	CONSOLE_AGENT_LAUNCHER,
	CONSOLE_SESSION,
	clampDim,
	ensureSessionCommand,
	installAgentLauncherCommand,
	isExpectedConsoleStreamEnd,
	primeConsoleSession,
	resizeCommand,
	sendKeysCommand,
	toHexKeys,
} from "./terminal-session";
import type { MachineProvider } from "@/lib/providers/types";

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
		expect(cmd).toContain("am_console_created=1");
		expect(cmd).toContain("terminal-agent.json");
		expect(cmd).toContain("am_status");
		expect(cmd).toContain("tmux send-keys -t amconsole");
		expect(cmd).toContain("AM_CONSOLE_READY");
		expect(cmd).toContain("apt-get install -y tmux");
	});

	it("clamps absurd dimensions to safe bounds", () => {
		const cmd = ensureSessionCommand(99999, 0);
		expect(cmd).toContain("-x 500 -y 5");
	});
});

describe("installAgentLauncherCommand", () => {
	it("installs a wrapper that records running/exited state", () => {
		const cmd = installAgentLauncherCommand();
		expect(cmd).toContain(CONSOLE_AGENT_LAUNCHER);
		expect(cmd).toContain('kind="${1:-}"');
		expect(cmd).toContain('state_file="$state_dir/terminal-agent.json"');
		expect(cmd).toContain("write_state running");
		expect(cmd).toContain("write_state exited");
		expect(cmd).toContain("hermes chat");
		expect(cmd).toContain("openclaw chat");
		expect(cmd).toContain("claude");
		expect(cmd).toContain("codex");
	});
});

describe("primeConsoleSession", () => {
	it("uses provider background exec when available", () => {
		const execBackground = vi.fn().mockResolvedValue(undefined);
		const provider = { execBackground } as unknown as MachineProvider;

		primeConsoleSession(provider, "machine-1", { cols: 88, rows: 24 });

		expect(execBackground).toHaveBeenCalledWith(
			"machine-1",
			expect.stringContaining(`tmux new-session -d -s ${CONSOLE_SESSION} -x 88 -y 24`),
		);
	});

	it("falls back to detached exec for providers without background exec", () => {
		const exec = vi.fn().mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
		const provider = { exec } as unknown as MachineProvider;

		primeConsoleSession(provider, "machine-2");

		expect(exec).toHaveBeenCalledWith(
			"machine-2",
			expect.stringContaining("nohup bash -lc"),
			{ timeoutMs: 5_000 },
		);
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

describe("isExpectedConsoleStreamEnd", () => {
	it("treats provider deadlines from tail -f as reconnect boundaries", () => {
		expect(
			isExpectedConsoleStreamEnd(
				new Error(
					"e2b streamExec failed on sbx: [deadline_exceeded] the operation timed out",
				),
			),
		).toBe(true);
		expect(
			isExpectedConsoleStreamEnd(
				new Error("sprites streamExec timed out after 110000ms"),
			),
		).toBe(true);
	});

	it("keeps real stream failures visible", () => {
		expect(isExpectedConsoleStreamEnd(new Error("missing credentials"))).toBe(false);
		expect(isExpectedConsoleStreamEnd(new Error("machine not found"))).toBe(false);
	});
});
