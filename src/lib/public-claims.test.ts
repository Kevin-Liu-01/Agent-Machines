/**
 * Guard: no public surface may state a harness count the registry contradicts.
 *
 * The registries are authoritative and the app derives from them
 * (web/lib/platform/harness.ts reads web/data/mcps-catalog.json and
 * web/data/skills.json). README.md, docs/WHITEPAPER.md and the published npm
 * description restate those numbers by hand, which is the actual defect --
 * they said 35 MCP servers for as long as the registry said 39, and nothing
 * failed. The numbers cannot be derived inside static markdown or package
 * metadata, so the next best thing is a test that reads both sides.
 *
 * The scan is deliberately narrow rather than "every integer near the word
 * MCP": it pairs a number with a count noun only when they are adjacent, and
 * in a markdown table it only looks at rows whose first cell names the
 * subject. A guard that cries wolf on "1,400+ items from MCP registry" would
 * be turned off, and then the claim goes stale again.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readJson(relative: string): unknown {
	return JSON.parse(readFileSync(resolve(REPO_ROOT, relative), "utf8"));
}

function readText(relative: string): string {
	return readFileSync(resolve(REPO_ROOT, relative), "utf8");
}

/** Subjects whose public count must equal a registry length. */
type Subject = "mcp" | "skills";

/** Registry lengths, read the same way web/lib/platform/harness.ts reads them. */
function registryCounts(): Record<Subject, number> {
	const catalog = readJson("web/data/mcps-catalog.json") as { servers: unknown[] };
	const skills = readJson("web/data/skills.json") as unknown[];
	assert.ok(Array.isArray(catalog.servers), "mcps-catalog.json has no servers array");
	assert.ok(Array.isArray(skills), "skills.json is not an array");
	return { mcp: catalog.servers.length, skills: skills.length };
}

/** Words that mark an integer as a count of something, in either direction. */
const COUNT_NOUN = /(servers?|entries|items|skills?|procedures?|mcps?|files?)/i;

/**
 * Left boundary that rejects a digit run continuing a longer number. Without
 * it, "3.7 SKILL.md protocol" reads as a claim of 7 skills and "Q4 2026" as a
 * claim of 2026 of something.
 */
const NOT_PART_OF_NUMBER = "(?<![\\d.])";

const SUBJECT_WORD: Record<Subject, RegExp> = {
	mcp: /\bmcps?\b/i,
	// Case-insensitive on purpose: the row labels are title-case ("**Skills**")
	// while the protocol name is upper ("SKILL.md"), and a case-sensitive
	// pattern silently skipped the README row instead of checking it.
	skills: /\bskills?\b|\bskill\.md\b/i,
};

function subjectOf(text: string): Subject | null {
	// MCP first: an "MCP servers" row also mentions skills paths often enough
	// that the looser pattern would steal it.
	if (SUBJECT_WORD.mcp.test(text)) return "mcp";
	if (SUBJECT_WORD.skills.test(text)) return "skills";
	return null;
}

function toInt(raw: string): number {
	return Number.parseInt(raw.replace(/,/g, ""), 10);
}

type Claim = { subject: Subject; value: number; text: string };

/**
 * Numbers in one table cell that are counts of `subject`: the whole cell is a
 * number, or a count noun sits immediately before or after it.
 */
function claimsInCell(cell: string, subject: Subject): Claim[] {
	const trimmed = cell.trim().replace(/\*\*/g, "");
	if (/^\d[\d,]*\+?$/.test(trimmed)) {
		return [{ subject, value: toInt(trimmed), text: trimmed }];
	}
	const found: Claim[] = [];
	// One optional adjective between number and noun ("35 bundled entries").
	// NOT_PART_OF_NUMBER keeps a section number out of it: "3.7 SKILL.md
	// protocol" is a heading, not a claim that there are 7 skills.
	const adjacent = new RegExp(
		`${NOT_PART_OF_NUMBER}(\\d[\\d,]*)\\+?\\s+(?:[A-Za-z][\\w.-]*\\s+)?([A-Za-z][\\w.]*)` +
			`|([A-Za-z][\\w.]*)\\s+\\(?${NOT_PART_OF_NUMBER}(\\d[\\d,]*)\\+?`,
		"g",
	);
	for (const match of trimmed.matchAll(adjacent)) {
		const [, before, after, noun, following] = match;
		if (before && after && COUNT_NOUN.test(after)) {
			found.push({ subject, value: toInt(before), text: match[0] });
			continue;
		}
		if (noun && following && COUNT_NOUN.test(noun)) {
			found.push({ subject, value: toInt(following), text: match[0] });
		}
	}
	return found;
}

/** Every count claim in one markdown/plain-text line. */
function claimsInLine(line: string): Claim[] {
	if (line.trimStart().startsWith("|")) {
		const cells = line.split("|").slice(1, -1);
		const label = cells[0];
		if (label === undefined) return [];
		const subject = subjectOf(label);
		// A row whose label names neither subject is not a claim about either,
		// however many numbers its other cells carry.
		if (!subject) return [];
		return cells.slice(1).flatMap((cell) => claimsInCell(cell, subject));
	}
	const found: Claim[] = [];
	// Prose: only a number directly against a subject word counts, so a
	// sentence that merely mentions MCP is never read as a count of MCPs.
	const prose = new RegExp(
		`${NOT_PART_OF_NUMBER}(\\d[\\d,]*)\\+?\\s+(?:[A-Za-z][\\w.-]*\\s+)?(mcps?|skills?|skill\\.md)\\b`,
		"gi",
	);
	for (const match of line.matchAll(prose)) {
		const subject = subjectOf(match[2] ?? "");
		if (subject) found.push({ subject, value: toInt(match[1] ?? ""), text: match[0] });
	}
	return found;
}

function claimsIn(text: string): Array<Claim & { line: number }> {
	return text.split("\n").flatMap((line, index) =>
		claimsInLine(line).map((claim) => ({ ...claim, line: index + 1 })),
	);
}

/** Public surfaces that restate a registry count. */
const PUBLIC_FILES = ["README.md", "docs/WHITEPAPER.md"];

test("README and whitepaper counts match the registries", () => {
	const expected = registryCounts();
	for (const file of PUBLIC_FILES) {
		const claims = claimsIn(readText(file));
		assert.ok(claims.length > 0, `${file}: found no count claims -- the scanner is broken`);
		for (const claim of claims) {
			assert.equal(
				claim.value,
				expected[claim.subject],
				`${file}:${claim.line} claims ${claim.value} for ${claim.subject} ("${claim.text}"); the registry says ${expected[claim.subject]}`,
			);
		}
	}
});

test("the published npm description matches the registries", () => {
	const expected = registryCounts();
	const pkg = readJson("package.json") as { description?: string };
	assert.ok(pkg.description, "package.json has no description");
	const claims = claimsInLine(pkg.description);
	assert.ok(claims.length > 0, "package.json description states no counts to check");
	for (const claim of claims) {
		assert.equal(
			claim.value,
			expected[claim.subject],
			`package.json description claims ${claim.value} for ${claim.subject} ("${claim.text}"); the registry says ${expected[claim.subject]}`,
		);
	}
});

/**
 * The two catalogs are copies of one another (web/scripts/sync-data.mjs copies
 * knowledge/ into web/data/). If they drift, "the registry" stops being a
 * single number and the guard above silently checks the wrong one.
 */
test("the knowledge and web MCP catalogs agree", () => {
	const knowledge = readJson("knowledge/mcps/catalog.json") as { servers: unknown[] };
	const web = readJson("web/data/mcps-catalog.json") as { servers: unknown[] };
	assert.equal(knowledge.servers.length, web.servers.length);
});

test("the scanner reads the claim shapes these files actually use", () => {
	// Locks the scanner itself down. Each string is the shape of a real line
	// from README.md, docs/WHITEPAPER.md or package.json at the time the 35 ->
	// 39 correction landed; a rewrite of the scanner that stops seeing one of
	// them would make the guard above pass vacuously.
	const cases: Array<[string, Array<[Subject, number]>]> = [
		// \u00b7 is the middot the npm description actually separates with; it
		// stays an escape so this file is pure ASCII.
		["161 skills \u00b7 39 MCP servers.", [["skills", 161], ["mcp", 39]]],
		[
			"| **MCP servers** | `knowledge/mcps` catalog | 39 servers; credential-gated |",
			[["mcp", 39]],
		],
		["| **MCP servers** | Catalog + user install | 39 bundled entries |", [["mcp", 39]]],
		// A tier breakdown after the total must not read as four more claims.
		[
			"| **MCP servers** | Catalog + user install | 39 servers: 2 core, 32 bundled, 4 IDE, 1 reference |",
			[["mcp", 39]],
		],
		["| MCP catalog servers | 39 |", [["mcp", 39]]],
		["| SKILL.md skills | 161 |", [["skills", 161]]],
		[
			"| **Skills** | `knowledge/skills/*/SKILL.md` | Versioned procedures (161 today) |",
			[["skills", 161]],
		],
		// Must NOT be read as counts: a registry row that merely mentions MCP,
		// and prose with a list number in front of it.
		[
			"| **Registry (install)** | `web/lib/dashboard/registry/*` | **1,400+** searchable items -- official MCP registry, skills.sh, npm CLIs |",
			[],
		],
		["2. **Other agents** drive an MCP + CLI surface so a head agent can route.", []],
		["| **Q4 2026** | Agent Machines MCP server + fleet CLI |", []],
		// A section number is not a count.
		["### 3.7 SKILL.md protocol", []],
	];
	for (const [line, want] of cases) {
		assert.deepEqual(
			claimsInLine(line).map((claim) => [claim.subject, claim.value]),
			want,
			`scanner misread: ${line}`,
		);
	}
});
