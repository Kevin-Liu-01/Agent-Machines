---
name: hotfix-preview
description: Cherry-pick a commit from dev onto preview without a PR. Use when you need to cherry-pick a fix to preview without a PR, or for urgent fixes that can't wait for a full promote cycle.
argument-hint: "[<commit-sha>] — defaults to dev HEAD"
---

## When to use

A fix is on `dev` and needs to reach `preview` (and then prod) immediately.
The full `/promote` flow creates a changelog PR that needs review and merge.
This skill skips the PR and cherry-picks directly.

## Rules

- The commit must already exist on `dev`. Do not cherry-pick unmerged work.
- Cherry-pick creates a new SHA on `preview`. The original SHA stays on `dev`.
  Both branches contain the same diff; history diverges by one merge-base commit.
  This is fine — `/promote` reconciles them on the next full promotion.
- Never force-push `preview` or `dev`.

## Task

```bash
set -euo pipefail

REMOTE="${REMOTE:-upstream}"
SHA="${1:-$(git rev-parse "$REMOTE/dev")}"

# Validate the commit exists on dev
if ! git merge-base --is-ancestor "$SHA" "$REMOTE/dev"; then
  echo "error: $SHA is not on $REMOTE/dev" >&2
  exit 1
fi

# Cherry-pick onto preview
git fetch "$REMOTE" preview
git switch preview
git pull --ff-only "$REMOTE" preview
git cherry-pick "$SHA"
git push "$REMOTE" preview

# Show result
echo ""
echo "Cherry-picked $(git rev-parse --short "$SHA") onto preview as $(git log -1 --format='%h') — $(git log -1 --format='%s')"
```
