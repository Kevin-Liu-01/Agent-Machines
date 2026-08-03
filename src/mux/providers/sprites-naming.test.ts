/**
 * How a caller's name becomes a sprite name.
 *
 * Sprites is the one substrate where the CALLER names the sandbox, and the two
 * surfaces of this product need opposite behavior from that:
 *
 * - The CLI/SDK treats a name as an IDENTITY. `create({name: "reviewer"})`
 *   twice, from two processes, must reach one machine -- that is what makes
 *   `connect("reviewer")` work at all.
 * - The hosted control plane treats a name as a LABEL. Two dashboard machines
 *   may share a display name, and making them one sandbox is a measured live
 *   failure: docs/MUX-RESULTS.md records "sprite not found -- a concurrent run
 *   destroyed the same deterministically-named sprite".
 *
 * `CreateSandboxOptions.onNameConflict` is how one adapter serves both, which is
 * the precondition for deleting the control plane's duplicate copy (ROADMAP
 * 0.2). Without it, converging on either rule regresses the other surface.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { Sprite, SpritesClient } from "@fly/sprites";

import { createSpritesProvider } from "./sprites.js";

/** Records every name create() asks for, and hands back a matching sprite. */
class NamingClient {
	readonly created: string[] = [];
	readonly fetched: string[] = [];
	/** Names that already exist, so create() 409s the way the vendor does. */
	existing = new Set<string>();

	async createSprite(name: string): Promise<Sprite> {
		this.created.push(name);
		if (this.existing.has(name)) {
			throw Object.assign(new Error("sprite already exists"), { status: 409 });
		}
		this.existing.add(name);
		return { name, status: "running" } as unknown as Sprite;
	}

	async getSprite(name: string): Promise<Sprite> {
		this.fetched.push(name);
		return { name, status: "suspended" } as unknown as Sprite;
	}
}

function providerFor(client: NamingClient) {
	return createSpritesProvider({ token: "t" }, client as unknown as SpritesClient);
}

async function nameFrom(
	client: NamingClient,
	options: { name?: string; onNameConflict?: "adopt" | "unique" },
): Promise<string> {
	const handle = await providerFor(client).create(options);
	return handle.id;
}

test("the default is adopt: one name is one sandbox, across calls", async () => {
	const client = new NamingClient();
	const first = await nameFrom(client, { name: "reviewer" });
	assert.equal(first, "am-mux-reviewer", "deterministic, so another process can find it");

	// Second create with the same name: the vendor 409s and the adapter adopts,
	// which is what makes a named create idempotent.
	const second = await nameFrom(client, { name: "reviewer" });
	assert.equal(second, first);
	assert.deepEqual(client.fetched, ["am-mux-reviewer"], "adopted, not re-created");
	assert.equal(client.existing.size, 1, "one sandbox exists, not two");
});

test('"unique" gives two sandboxes for one name, and adopts neither', async () => {
	const client = new NamingClient();
	const first = await nameFrom(client, { name: "reviewer", onNameConflict: "unique" });
	const second = await nameFrom(client, { name: "reviewer", onNameConflict: "unique" });

	assert.notEqual(first, second, "two machines with one display name stay distinct");
	assert.deepEqual(client.fetched, [], "nothing was adopted");
	assert.equal(client.existing.size, 2);
	// The caller's name is still legible in both -- an operator reading the
	// vendor's console has to be able to tell what a sprite belongs to.
	for (const name of [first, second]) {
		assert.match(name, /^am-mux-reviewer-/);
	}
});

test('"unique" suffixes even an already-derived name', async () => {
	// A caller round-tripping the derived name back in would otherwise get the
	// deterministic one, silently defeating the request for uniqueness.
	const client = new NamingClient();
	const first = await nameFrom(client, {
		name: "am-mux-reviewer",
		onNameConflict: "unique",
	});
	const second = await nameFrom(client, {
		name: "am-mux-reviewer",
		onNameConflict: "unique",
	});
	assert.notEqual(first, second);
	assert.match(first, /^am-mux-reviewer-.+/);
	assert.equal(client.existing.size, 2);
});

test("adopt passes an already-derived name through unchanged", async () => {
	// Reconnecting by the derived name must not re-derive and double the prefix.
	const client = new NamingClient();
	assert.equal(
		await nameFrom(client, { name: "am-mux-reviewer" }),
		"am-mux-reviewer",
	);
});

test("a name the vendor cannot accept is sanitized, not passed through", async () => {
	const client = new NamingClient();
	const name = await nameFrom(client, { name: "Review/Bot #2 " });
	assert.equal(name, "am-mux-review-bot--2");
	assert.match(name, /^[a-z0-9-]+$/, "vendor names are lowercase alphanumeric and dashes");
});

test("a name that sanitizes away still yields a usable name", async () => {
	// "///" has no legible characters left; falling through to an empty string
	// would post a nameless create.
	const client = new NamingClient();
	const name = await nameFrom(client, { name: "///" });
	assert.match(name, /^am-mux-.+/);
	assert.ok(name.length > "am-mux-".length);
});

test("no name at all is unique either way -- there is nothing to collide with", async () => {
	const client = new NamingClient();
	const first = await nameFrom(client, {});
	const second = await nameFrom(client, { onNameConflict: "adopt" });
	assert.notEqual(first, second);
	assert.equal(client.existing.size, 2);
});

test("under a unique name, a 409 still adopts -- it can only be our own retry", async () => {
	// The measured vendor behavior (MUX-RESULTS finding 5): create returns a 500
	// that created the sprite anyway, so the retry sees 409. With a unique name
	// that sprite is ours, so adopting is the correct recovery rather than a
	// collision -- which is why "unique" changes the NAME and nothing else.
	const client = new NamingClient();
	let attempts = 0;
	const flaky = {
		createSprite: async (name: string) => {
			attempts += 1;
			if (attempts === 1) {
				// The 500 that created it anyway.
				client.existing.add(name);
				throw Object.assign(new Error("internal error"), { status: 500 });
			}
			return client.createSprite(name);
		},
		getSprite: (name: string) => client.getSprite(name),
	};
	const handle = await createSpritesProvider(
		{ token: "t" },
		flaky as unknown as SpritesClient,
	).create({ name: "reviewer", onNameConflict: "unique" });
	assert.match(handle.id, /^am-mux-reviewer-/);
	assert.deepEqual(client.fetched, [handle.id], "recovered by adopting our own sprite");
});
