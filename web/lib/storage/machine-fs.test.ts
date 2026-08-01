import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Absence must be signalled out of band.
 *
 * The original code echoed a `__MISSING__` sentinel on stdout and compared
 * for equality. `echo` appends a newline and only some substrates trim exec
 * output (sprites and dedalus do; e2b and vercel do not), so on the untrimmed
 * lanes the comparison never matched and a missing file was returned AS
 * CONTENT -- the sentinel string became the chat or artifact body. These tests
 * pin both halves of the fix: absence is an exit code, and a file whose
 * contents happen to be the sentinel still reads as content.
 */

const execOnMachine = vi.hoisted(() => vi.fn());
vi.mock("@/lib/dashboard/exec", () => ({ execOnMachine }));

const { readBytes, readTextFile } = await import("./machine-fs");

const CTX = { machineId: "m-1", appDataRoot: "/home/user/.agent-machines" };
const FILE = "/home/user/.agent-machines/chats/a.json";

function result(over: Partial<{ stdout: string; stderr: string; exitCode: number }>) {
	return { stdout: "", stderr: "", exitCode: 0, ...over };
}

describe("readTextFile absence signalling", () => {
	beforeEach(() => {
		execOnMachine.mockReset();
	});

	it("asks the shell to exit with a distinct code rather than echo a sentinel", async () => {
		execOnMachine.mockResolvedValue(result({ exitCode: 42 }));
		await readTextFile(FILE, CTX);
		const command = execOnMachine.mock.calls[0][0] as string;
		expect(command).toContain("exit 42");
		expect(command).not.toContain("__MISSING__");
	});

	it("returns null on the missing-file exit code", async () => {
		execOnMachine.mockResolvedValue(result({ exitCode: 42 }));
		expect(await readTextFile(FILE, CTX)).toBeNull();
	});

	it("returns content whose text is exactly the old sentinel", async () => {
		// The sentinel approach could not tell this apart from absence.
		execOnMachine.mockResolvedValue(result({ stdout: "__MISSING__" }));
		expect(await readTextFile(FILE, CTX)).toBe("__MISSING__");
	});

	it("does not treat untrimmed output as absence", async () => {
		// This is the shipped bug: on e2b and vercel stdout arrived with a
		// trailing newline, so the equality check missed and the sentinel was
		// handed back as file content.
		execOnMachine.mockResolvedValue(result({ stdout: "__MISSING__\n" }));
		expect(await readTextFile(FILE, CTX)).toBe("__MISSING__\n");
	});

	it("still throws on a real failure", async () => {
		execOnMachine.mockResolvedValue(result({ exitCode: 1, stderr: "permission denied" }));
		await expect(readTextFile(FILE, CTX)).rejects.toThrow(/exit 1.*permission denied/);
	});
});

describe("readBytes absence signalling", () => {
	beforeEach(() => {
		execOnMachine.mockReset();
	});

	it("returns null on the missing-file exit code", async () => {
		execOnMachine.mockResolvedValue(result({ exitCode: 42 }));
		expect(await readBytes(FILE, CTX)).toBeNull();
	});

	it("decodes base64 payloads that would have collided with the sentinel", async () => {
		const encoded = Buffer.from("__MISSING__").toString("base64");
		execOnMachine.mockResolvedValue(result({ stdout: encoded }));
		const bytes = await readBytes(FILE, CTX);
		expect(bytes?.toString("utf8")).toBe("__MISSING__");
	});

	it("uses the exit code, not a stdout sentinel", async () => {
		execOnMachine.mockResolvedValue(result({ exitCode: 42 }));
		await readBytes(FILE, CTX);
		const command = execOnMachine.mock.calls[0][0] as string;
		expect(command).toContain("exit 42");
		expect(command).not.toContain("__MISSING__");
	});
});
