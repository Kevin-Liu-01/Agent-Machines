import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./runner", () => ({ finalizeGatewayBootstrap: vi.fn() }));
import { agentArtifactsPresent } from "./bootstrap-repair";
import type { MachineProvider } from "@/lib/providers";
import type { MachineRef } from "@/lib/user-config/schema";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(layout: "uv" | "legacy" | "prebaked" | "missing" | "nonexecutable", configured = true) {
	const root = mkdtempSync(join(tmpdir(), "am-hermes-readiness-")); roots.push(root);
	const put = (path: string, content: string, mode = 0o600) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content, { mode }); };
	if (configured) put(join(root, ".agent-machines/.env"), "API_SERVER_ENABLED=true\n");
	if (layout === "uv") {
		const actual = join(root, ".local/share/uv/tools/hermes-agent/bin/hermes");
		put(actual, "#!/bin/sh\nexit 0\n", 0o755);
		mkdirSync(join(root, ".local/bin"), { recursive: true });
		symlinkSync(actual, join(root, ".local/bin/hermes"));
	} else if (layout !== "missing") {
		const path = join(root, layout === "legacy" ? ".agent-machines/venv/bin/hermes" : layout === "prebaked" ? "opt/hermes/bin/hermes" : ".local/bin/hermes");
		put(path, "#!/bin/sh\nexit 0\n", 0o755);
		if (layout === "nonexecutable") chmodSync(path, 0o600);
	}
	const exec = vi.fn(async (_id: string, command: string) => {
		// Execute the actual generated probe in an isolated provider-home fixture.
		// No global Hermes install or developer shell PATH may satisfy the check.
		const rewritten = command.replaceAll("/home/user", root).replaceAll("/opt/hermes/bin", join(root, "opt/hermes/bin"));
		try { return { stdout: execFileSync("/bin/bash", ["--noprofile", "--norc", "-c", rewritten], { env: { HOME: root, PATH: "/usr/bin:/bin", NODE_ENV: "test" }, encoding: "utf8", timeout: 5000 }), stderr: "", exitCode: 0 }; }
		catch (error) { const result = error as { stdout?: string; stderr?: string; status?: number }; return { stdout: String(result.stdout ?? ""), stderr: String(result.stderr ?? ""), exitCode: result.status ?? 1 }; }
	});
	return { machine: { id: "qa-hermes", providerKind: "e2b", agentKind: "hermes" } as MachineRef, provider: { exec } as unknown as MachineProvider, exec };
}

describe("Hermes artifact readiness uses supported launch paths", () => {
	it.each(["uv", "legacy", "prebaked"] as const)("accepts a configured executable %s install", async (layout) => {
		const f = fixture(layout);
		expect(await agentArtifactsPresent(f.machine, f.provider)).toBe(true);
		expect(f.exec).toHaveBeenCalledTimes(1);
		expect(f.exec.mock.calls[0][0]).toBe("qa-hermes");
	});
	it.each(["missing", "nonexecutable"] as const)("refuses a %s executable even with configuration present", async (layout) => {
		const f = fixture(layout);
		expect(await agentArtifactsPresent(f.machine, f.provider)).toBe(false);
	});
	it("refuses a real installed executable when runtime configuration is missing", async () => {
		const f = fixture("uv", false);
		expect(await agentArtifactsPresent(f.machine, f.provider)).toBe(false);
	});
});
