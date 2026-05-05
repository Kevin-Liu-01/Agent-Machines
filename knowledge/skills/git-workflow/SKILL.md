---
name: git-workflow
description: "Trunk-based git workflow with worktrees, switch/restore over checkout, Conventional Commits, force-with-lease. Use whenever the user asks me to commit, push, branch, or rebase."
version: 1.0.0
author: Kevin Liu
license: MIT
metadata:
  hermes:
    tags: [git, workflow, conventional-commits, worktrees]
---

# Git Workflow

## Switch over checkout

Use `git switch` for branch operations. Never `git checkout`. `checkout --` silently destroys uncommitted work, and `checkout <branch>` is ambiguous when a file shares the name. `switch` only switches branches. Use `git restore` for file-level operations.

## Trunk-based, small PRs

Target ≤ 200 lines of changed code per PR (excluding generated files). Larger changes get split into stacked diffs. Stack with worktrees, not branch-switching:

```bash
git fetch origin && git switch dev && git pull --ff-only
mkdir -p ../wt
git worktree add -b feat/a ../wt/a dev
git worktree add -b feat/b ../wt/b feat/a    # stacked on feat/a
```

After `feat/a` merges, rebase downstream branches:

```bash
git -C ../wt/b fetch origin && git -C ../wt/b rebase origin/dev
```

## Conventional Commits

`type(scope): description`. Type is `feat`, `fix`, `refactor`, `docs`, `test`, `chore`. Imperative mood, lowercase, no period, ≤72 chars.

```
feat(auth): add org-level permissions
fix(billing): handle zero-balance edge case
refactor(api): extract validation to middleware
```

**Never use "and" in a commit message.** If you need "and", you're describing two changes that should be two commits. Split them.

## Force pushes

After a rebase, use `--force-with-lease`, never `--force`. Never force-push to main/master.

## Heredoc for multi-line commit messages

```bash
git commit -m "$(cat <<'EOF'
type(scope): one-liner subject

Optional body explaining why, not what.

Refs #123
EOF
)"
```

## Pre-commit checklist

1. `git status -sb` -- review staged + unstaged changes.
2. `git diff` -- eyeball every hunk.
3. `git add -p` -- stage precisely; split unrelated hunks across commits.
4. `pnpm typecheck && pnpm lint && pnpm test` (or the project's equivalent).
5. `git commit -m "..."` -- Conventional, ≤72 chars.

## Never

- `--no-verify`, `--no-gpg-sign` (unless explicitly requested).
- `git rebase -i` from a tool call (interactive, will hang).
- `--amend` once pushed (unless explicitly requested + force-with-lease).
- `git config` updates from a tool call.
