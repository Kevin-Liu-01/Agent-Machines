---
name: plan-mode-review
description: "Structured review checklist before implementing changes. Use when planning a feature, before opening a PR, or when the user shares code that needs scrutiny across architecture, code quality, tests, and performance."
version: 1.0.0
author: Kevin Liu
license: MIT
metadata:
  hermes:
    tags: [review, planning, code-quality, architecture]
    related_skills: [agent-ethos, empirical-verification, security-audit]
---

# Plan-Mode Review Checklist

A structured review pass that catches issues before they ship. Walk through each section in order. A finding in section 1 invalidates everything in sections 2-4 -- don't review code that isn't the right code.

## 1. Architecture

- Is the right system absorbing this change? If a frontend bug is being fixed in the backend, stop.
- Are existing patterns being matched, or is a new pattern being introduced? New patterns require justification.
- Is this a one-way door (hard to reverse) or a two-way door? One-way decisions get more scrutiny.
- Does the public API change? If yes, what's the migration story?
- Does the change cross trust boundaries? (See `security-audit`.)

## 2. Code quality

- Functions ≤ 70 lines, files ≤ 500 lines, args ≤ 5, nesting ≤ 3 levels.
- Function name doesn't contain "and"; if it does, split.
- No `any` (TypeScript) or `Any` (Python) without explicit, documented justification.
- No fallback chains (`a or b or c`). Explicit branches.
- No ternaries used for control flow. Early returns instead.
- Comments explain *intent*, not *what*. Remove narrative comments.
- Match the surrounding style. If the file uses factories, use factories.

## 3. Tests

- New behavior has a new test. Bug fixes have a regression test that fails before the fix.
- Tests describe invariants ("a paid user cannot see the trial banner"), not specific bugs ("regression test for issue #1234").
- No tests that mock the system under test (mock-echo). Tests must exercise real behavior.
- Tests pass under the real CI command, not a local subset.

## 4. Performance

- Hot paths: any new allocation in a per-request path? Any new DB round-trip? Any N+1?
- New dependencies pulled in transitively? Bundle size delta if frontend.
- Any new feature flag, cache, or polling? Justify TTLs.

## 5. Errors and observability

- Failure modes have specific error types, not generic `Exception` / `Error`.
- User-facing errors don't leak internal state (host names, IPs, stack traces, schema).
- Operator-facing logs are structured (logger.error with kv pairs), not f-string blobs.
- Correct HTTP status code: 422 for malformed fields, 409 for state conflicts, 400 for syntax, 500 for our bugs.

## 6. Docs

- Module docstring updated if public surface changed.
- README example updated if usage changed.
- Migration note if this is a breaking change.

## 7. Pre-ship

- `pnpm typecheck` clean (or `npx tsc --noEmit` for the affected project).
- `pnpm lint` clean.
- `pnpm test <project>` passing.
- `pnpm build <project>` passing.
- Pre-existing failures are reported separately from new failures.

## When I run this against my own work

I run this checklist on every change before declaring it done, in this order. If any item is "no" or "unclear", I block the change and report. The user gets the unedited list of failures, not a clean "looks good".
