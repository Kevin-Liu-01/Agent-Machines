---
name: cross-modal-review
version: 1.0.0
description: Quality gate via a second AI model. Spawn a different model to review work before committing. Grades against the originating skill's Contract. Use when you want a second opinion from a different model, or the user says "second opinion", "cross-modal review", "double check this", or "get another perspective".
triggers:
  - "second opinion"
  - "cross-modal review"
  - "double check this"
  - "get another perspective"
  - "review with a different model"
tools:
  - Task (spawn subagent with different model)
  - Read (work product, skill files)
mutating: false
---

# Cross-Modal Review — Second Opinion Quality Gate

Send work to a different AI model for independent review. The reviewer grades
against the originating skill's Contract section — checking promises, not vibes.

## Contract

This skill guarantees:
- Work product is reviewed by a different model before finalizing
- Review grades against the originating skill's Contract (what was promised)
- Agreement and disagreement reported transparently
- User always makes the final decision (user sovereignty)
- Never auto-applies reviewer suggestions

## Phases

### Phase 1: Capture Work Product

Identify what needs review:
- The brain page, code change, analysis, or decision
- The originating skill (which skill produced this output)
- The Contract section from that skill (what was promised)

### Phase 2: Load the Contract

Read the originating skill's Contract section. This is the grading rubric.
Example: if the output came from `gstack-review`, load `gstack-review/SKILL.md`
and extract the Contract section.

If no originating skill (ad-hoc work), construct a minimal contract:
- What was the user's request?
- What did the agent promise to deliver?
- What quality bar was implied?

### Phase 3: Spawn Review Model

Use Cursor's Task tool to spawn a subagent with a different model:

```
Task(
  model: "fast" or a named alternative model,
  prompt: "You are an independent reviewer. Grade this work against the Contract below.
  
  CONTRACT:
  {paste the Contract section}
  
  WORK PRODUCT:
  {paste the work to review}
  
  For each promise in the Contract, answer: PASS or FAIL with specific evidence.
  Then give an overall verdict: PASS / ISSUES FOUND.
  List specific findings with evidence."
)
```

### Phase 4: Synthesize

Present the review to Kevin:

```
Cross-Modal Review
==================
Reviewer: {model name}
Contract: {originating skill name}
Verdict: PASS | ISSUES FOUND

Contract compliance:
  [PASS] {promise 1} — {evidence}
  [FAIL] {promise 2} — {what's missing}

Findings:
  1. {finding with evidence}
  2. {finding with evidence}

Agreement with primary: {X}%
Recommendation: {accept / revise / redo}
```

### Phase 5: User Decision

Present the findings. Kevin decides:
- **Accept** — ship as-is
- **Revise** — apply specific suggestions from the reviewer
- **Redo** — start over with reviewer's feedback incorporated

Never auto-apply. The reviewer is advisory.

## Model Routing

| Review type | Recommended reviewer |
|-------------|---------------------|
| Code review | Use `fast` model for quick check, named model for deep review |
| Design review | Use a different named model than the one that produced the design |
| Wiki page quality | Use `fast` — Contract compliance is straightforward |
| Architecture decision | Use the most capable available model |

## Refusal Routing

If the review model refuses the task:
1. Try the next model in the routing chain
2. Never show the refusal to Kevin
3. If ALL models refuse, tell Kevin: "Cross-modal review unavailable for this content."

## Anti-Patterns

- Auto-applying reviewer suggestions without Kevin's approval
- Showing model refusals to the user
- Using the same model for review and generation
- Reviewing vibes instead of Contract compliance
- Skipping the Contract reference (no rubric = no useful review)
- Running cross-modal review on trivial tasks (not every wiki edit needs a second opinion)
