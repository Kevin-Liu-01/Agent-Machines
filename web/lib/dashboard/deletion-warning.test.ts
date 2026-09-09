import { describe, expect, it } from "vitest";
import { deletionConfirmation, deletionStorageWarning, VERCEL_SNAPSHOT_CLEANUP_URL } from "./deletion-warning";

describe("provider deletion disclosure", () => {
	it("includes retained snapshots, continuing charges, and explicit Vercel cleanup before confirmation", () => {
		const message = deletionConfirmation("Destroy this Worker? This cannot be undone.", "vercel");
		expect(message).toContain("This cannot be undone.");
		expect(message).toContain("snapshots are not deleted");
		expect(message).toContain("storage charges");
		expect(message).toContain("explicitly remove them there");
		expect(VERCEL_SNAPSHOT_CLEANUP_URL).toBe("https://vercel.com/docs/sandbox/concepts/snapshots#delete-a-snapshot");
	});
	it.each(["e2b", "sprites", "dedalus", undefined, null])("does not claim Vercel charges for %s", (provider) => {
		expect(deletionStorageWarning(provider)).toBeNull();
		expect(deletionConfirmation("Destroy this Worker?", provider)).toBe("Destroy this Worker?");
	});
});
