/**
 * Tests for src/mux/events.ts: LineBuffer chunk reassembly and the
 * defensive tryParseJson line parser.
 *
 * Run: tsx --test src/mux/events.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { LineBuffer, tryParseJson } from "./events.js";

test("LineBuffer reassembles lines across chunk boundaries", () => {
	const buffer = new LineBuffer();
	assert.deepEqual(buffer.push("hel"), []);
	assert.deepEqual(buffer.push("lo\nwo"), ["hello"]);
	assert.deepEqual(buffer.push("rld"), []);
	assert.deepEqual(buffer.push("!\n"), ["world!"]);
	assert.deepEqual(buffer.flush(), []);
});

test("LineBuffer splits multi-line chunks and drops empty lines", () => {
	const buffer = new LineBuffer();
	assert.deepEqual(buffer.push("a\n\nb\nc"), ["a", "b"]);
	// "c" has no terminator yet; it stays buffered until more input or flush.
	assert.deepEqual(buffer.push("d\n"), ["cd"]);
	assert.deepEqual(buffer.push("one\ntwo\nthree\n"), ["one", "two", "three"]);
	assert.deepEqual(buffer.flush(), []);
});

test("LineBuffer.flush returns the trimmed remainder and resets", () => {
	const buffer = new LineBuffer();
	assert.deepEqual(buffer.push("tail  "), []);
	assert.deepEqual(buffer.flush(), ["tail"]);

	// Whitespace-only remainders flush to nothing.
	assert.deepEqual(buffer.push("done\n   "), ["done"]);
	assert.deepEqual(buffer.flush(), []);

	// The buffer is reusable after a flush.
	assert.deepEqual(buffer.push("next\n"), ["next"]);
	assert.deepEqual(buffer.flush(), []);
});

test("tryParseJson parses plain JSON objects", () => {
	assert.deepEqual(tryParseJson('{"type":"result","ok":true}'), {
		type: "result",
		ok: true,
	});
	assert.deepEqual(tryParseJson('  {"nested":{"a":[1,2]}}  '), {
		nested: { a: [1, 2] },
	});
	assert.deepEqual(tryParseJson("{}"), {});
});

test("tryParseJson rejects top-level arrays via the '{' prefix gate", () => {
	// JSON.parse would happily return an array here, and an array WOULD
	// pass the `typeof value === "object" && value !== null` check. The
	// implementation never gets that far: the trimmed line must start
	// with "{", so top-level arrays are rejected before parsing. This
	// test documents that actual behavior.
	assert.equal(tryParseJson('[{"a":1}]'), null);
	assert.equal(tryParseJson("[1,2,3]"), null);
	assert.equal(tryParseJson("[]"), null);
});

test("tryParseJson returns null for garbage and non-object prefixes", () => {
	assert.equal(tryParseJson(""), null);
	assert.equal(tryParseJson("   "), null);
	assert.equal(tryParseJson("plain text noise"), null);
	assert.equal(tryParseJson('{"broken":'), null);
	assert.equal(tryParseJson('{"a":1} trailing garbage'), null);
	assert.equal(tryParseJson('data: {"a":1}'), null);
	assert.equal(tryParseJson("null"), null);
	assert.equal(tryParseJson("42"), null);
	assert.equal(tryParseJson('"a json string"'), null);
});
