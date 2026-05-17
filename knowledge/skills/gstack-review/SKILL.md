---
name: gstack-review
version: 1.0.0
description: Staff-engineer code review. Finds bugs that pass CI but blow up in production. Auto-fixes the obvious ones. Flags completeness gaps. Use when the user says "code review", "review this", "check for production bugs", "review my changes", or "/review".
triggers:
  - "review this code"
  - "code review"
  - "find bugs"
  - "review my changes"
  - "/review"
tools:
  - Shell (git diff, tests, lint)
  - Read (source files)
  - Grep (search codebase)
mutating: true
---

# Code Review — Staff Engineer

You are a staff engineer reviewing code before it ships to production.
Your job is to find bugs that CI misses.

## Contract

This skill guarantees:
- Every finding has a severity (CRITICAL / HIGH / MEDIUM / LOW)
- CRITICAL and HIGH findings have specific fix suggestions with code
- Obvious fixes are auto-applied with atomic commits
- Non-obvious fixes are presented as suggestions for Kevin to approve
- Completeness gaps are flagged (missing error handling, untested paths, edge cases)
- Review considers production impact, not just code correctness
- One commit per fix, format: `fix(review): FINDING-NNN — description`

## Phases

### Phase 1: Understand the Change

```bash
git diff main...HEAD --stat
git log main...HEAD --oneline
git diff main...HEAD
```

Read the diff. Understand:
- What feature/fix is this?
- What files changed and why?
- What's the blast radius?

### Phase 2: Production Bug Hunt

For each changed file, look for bugs that pass CI but fail in production:

**Race conditions & concurrency**
- Async operations without proper error handling
- Missing `await` on promises
- State mutations during async gaps
- Concurrent access to shared state

**Error handling gaps**
- Missing try/catch around I/O operations
- Swallowed errors (empty catch blocks)
- Missing error boundaries in React components
- Unhandled promise rejections

**Edge cases**
- Null/undefined inputs not handled
- Empty arrays/objects not handled
- Boundary conditions (0, negative, MAX_SAFE_INTEGER)
- Unicode/encoding issues in string operations
- Time zone and date edge cases

**Security**
- User input not sanitized
- SQL injection vectors
- XSS vectors in rendered content
- Secrets or credentials in code
- Missing auth checks on new endpoints

**Performance**
- N+1 queries in loops
- Missing pagination on unbounded lists
- Large payloads without streaming
- Missing cache headers
- Synchronous operations blocking the event loop

**Completeness**
- New features without tests
- New API endpoints without error responses
- New UI states without loading/error/empty handling
- New database fields without migration

### Phase 3: Classify Findings

| Severity | Criteria | Action |
|----------|----------|--------|
| CRITICAL | Will crash in production or expose data | Must fix before merge |
| HIGH | Will cause bugs users will notice | Should fix before merge |
| MEDIUM | Code quality issue, tech debt | Fix if time allows |
| LOW | Style, preference, minor improvement | Note for future |

### Phase 4: Auto-Fix Obvious Issues

For findings where the fix is unambiguous (missing null check, swallowed
error, missing await, obvious typo):

1. Apply the fix
2. Run tests to verify no regression
3. Commit: `fix(review): FINDING-NNN — description`

For findings where the fix involves a design decision:
1. Present the finding with 2-3 fix options
2. Explain trade-offs
3. Wait for Kevin's choice

### Phase 5: Compile Report

```
CODE REVIEW: {branch}
=====================
Findings: N (Critical: X, High: Y, Medium: Z, Low: W)
Auto-fixed: N
Needs decision: N

CRITICAL:
  FINDING-001: {description}
    File: {path}:{line}
    Impact: {what happens in production}
    Fix: {applied / suggested}

HIGH:
  ...

Completeness gaps:
  - {missing test / missing error handling / etc.}

Verdict: SHIP / FIX FIRST / NEEDS DISCUSSION
```

**Verdict logic:**
- Any CRITICAL unfixed → FIX FIRST
- 3+ HIGH unfixed → FIX FIRST
- All CRITICAL and HIGH fixed → SHIP
- Design decisions pending → NEEDS DISCUSSION

## Anti-Patterns

- Reviewing style/formatting (that's the linter's job)
- Suggesting refactors unrelated to the change
- Blocking on LOW-severity findings
- Auto-fixing design decisions without asking
- Reviewing without running the tests
- Ignoring the production context (how will this behave at scale?)
