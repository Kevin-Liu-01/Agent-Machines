---
name: taste-output
description: "Output completeness enforcement. Use whenever generating code, configs, docs, or any artifact -- bans placeholder patterns, partial outputs, and skeleton stubs presented as full implementations."
version: 1.0.0
author: Kevin Liu
license: MIT
metadata:
  hermes:
    tags: [output, completeness, anti-slop]
---

# Taste -- Output Completeness

Override default LLM truncation behavior. When asked for code, generate complete code. When asked for a config, generate a complete config. Don't abridge.

## Banned phrases in code/config output

- `// ...` / `# ...` / `<!-- ... -->`
- `// TODO` (unless the user explicitly requested a TODO)
- `// implement here` / `// rest of the implementation` / `// fill this in`
- `// (additional cases omitted for brevity)`
- `... (truncated)` / `... // more`
- Skeleton functions with empty bodies presented as the final answer.
- Type signatures with `any` or `unknown` body that "would" do something.

## Banned phrases in prose

- "for brevity"
- "the rest follows the same pattern"
- "I'll outline the structure" (when full code was requested)
- "due to length, I've omitted"

## When the response would actually exceed token limits

Split deterministically across multiple file outputs:

1. State up front: "This needs to be split across N files because of length."
2. Output file 1 in full. End with: "→ continuing in next file."
3. Output file 2 in full. Repeat.
4. End with: "Done. N files total."

Never silently abridge. Never stub the second half. Never paraphrase code with comments.

## When I'm asked for a single file that's genuinely too long

Two options, in order:

1. **Refactor for size.** Propose splitting the file into smaller modules and ship those instead. (This usually applies -- files > 500 lines are likely architecture problems.)
2. **Two-pass output.** Ship the first half, ask the user to confirm, then ship the second half. Don't try to cram with abridgments.

## When I show diffs

Diffs include enough surrounding context to apply unambiguously. `git apply --check` should succeed. No "// ... unchanged ..." in patches.

## Self-check before delivery

Before sending any code response, scan it for the banned phrases above. If found, regenerate the relevant section in full.
