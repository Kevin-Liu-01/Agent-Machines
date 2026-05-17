---
name: commit-and-push
description: Stage, commit, and push changes without opening a PR. Use when the user says "commit and push", "commit these to a new branch", "push this branch", or wants a branch + commit summary but does not want PR creation. Distinct from `yeet`, which owns the commit + push + PR flow.
---

# Commit and Push

Handle the common "just get this committed and pushed" workflow without drifting into PR creation.

## When to use

Use this skill when the user explicitly wants git changes committed and pushed, but does not
ask for a pull request.

Examples:

- "commit and push"
- "commit these to a new branch called `kevin/updated-dashboard`"
- "stage this and push it"
- "push the current work with an explanation of the changes"

If the user wants a PR too, use `yeet` instead.

## Workflow

### 1. Inspect before staging

Always gather context first:

```bash
git status --short
git diff --stat
git diff --cached --stat
git log --oneline -6
```

You are looking for:

- unrelated dirty files
- generated artifacts
- screenshots, traces, or browser logs
- obvious secrets (`.env`, credentials, tokens)
- the repo's recent commit style

### 2. Decide branch behavior

- If the user provided a branch name, use it.
- If the current branch is already a feature branch, stay on it unless the user asked otherwise.
- If the current branch is `main`/`master` and the user did not explicitly ask to push there, create
  a feature branch first, preferably `kevin/<slug>`.

Use non-destructive branch commands only:

```bash
git switch -c <branch>
git switch <branch>
```

Never use `git checkout` or `git restore` as the default path.

### 3. Stage intentionally

Do not blindly add everything if the tree includes junk. Exclude generated browser artifacts,
scratch outputs, and anything that should not ship.

Typical exclusions:

- `.playwright-mcp/`
- screenshots or trace dumps created only for verification
- local env files
- transient build output unless the repo intentionally tracks it

If the user said "everything," interpret that as everything relevant to the requested work, not
every piece of machine exhaust in the working tree.

### 4. Validate once if warranted

If the changes are code and the repo has an obvious targeted validation command, run it once before
committing. Prefer the narrowest meaningful check.

If validation is too expensive or unavailable, say so in the final summary.

### 5. Commit with repo-style messaging

Use the recent log to match local style. Prefer a concise imperative subject. If the repo uses
conventional commits, follow that convention.

Before committing, review the staged diff:

```bash
git diff --cached --stat
git diff --cached
```

### 6. Push and report cleanly

Push the current branch with upstream tracking:

```bash
git push -u origin "$(git branch --show-current)"
```

Then report:

- branch name
- commit hash
- what was included
- what was intentionally excluded
- any checks run

If the user asked for an explanation of code changes, summarize the changes by area, not file spam.

## Guardrails

- Never open a PR from this skill.
- Never commit obvious secrets.
- Never sweep unrelated changes into the commit just because `git add -A` is easy.
- Prefer one coherent commit per requested unit of work.
- If unrelated dirty files make safe staging ambiguous, narrow the scope and explain the exclusion.

## Related Skills

- `yeet` - use for commit + push + PR
- `commit` - commit-only workflow
- `project-briefing` - summarize what changed after the push
