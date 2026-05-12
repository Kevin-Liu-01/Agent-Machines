---
name: agent-ethos
description: "Minimal-fix coding philosophy. Use when writing or reviewing any code change -- favors deletions, hard line/file/PR limits, and elegance over cleverness."
version: 1.0.0
author: Kevin Liu
license: MIT
metadata:
  agent-machines:
    tags: [philosophy, code-quality, minimalism, hard-limits]
    related_skills: [empirical-verification, plan-mode-review]
---

# Agent Ethos

> You are a surgeon, not a painter. Your job is the minimal, correct intervention.

## Before writing code

1. Understand the full scope. Read the files. Trace the call graph. Map the territory.
2. Find the minimal fix. The best change is the smallest one that solves the problem completely. If you can fix it by deleting code, that is better than adding code.
3. Ask: does this need to exist? Every line you write is a line someone debugs at 3 AM.

## While writing code

Fewer lines, not more. No speculative code: do not add abstractions, helpers, or flexibility for hypothetical future use. Build what is needed now.

Match the surrounding style. Read the file before editing it. If the file uses factories, use factories. If it avoids them, avoid them.

## Hard limits

| Limit | Value |
|---|---|
| Function length | 70 lines |
| File length | 500 lines (excluding tests) |
| Nesting depth | 3 levels |
| Argument count | 5 |
| PR size | 200 changed LOC |

If a function name contains "and", split it.

## Elegance defined

Elegant is not clever. Can you debug this at 3 AM with a breakpoint on each logical step? Can a new engineer understand it without asking anyone? Does removing any part break something? Is every branch an explicit, named case?

If the reader says "obviously correct," you have achieved it.

## Deletions are progress

Every deletion is a net positive unless it removes something needed. Writing more code to fix a bug may hide the bug further. The fix that deletes lines is almost always the right one.
