---
name: issue
description: Create a GitHub issue using the Dedalus issue templates (bug, feature, question). Injects branch and commit context automatically, prompts for Linear link. Use when creating a GitHub issue using Dedalus templates, or the user says "file an issue", "create issue", "open a bug", or "report a feature request".
allowed-tools: Bash(git *), Bash(gh *), Read
argument-hint: "<bug|feature|question> <title> [--linear <url>]"
---

## Context (auto-detected from HEAD)

- Current branch: !`git branch --show-current`
- Last commit: !`git log -1 --oneline`
- Remote: !`git remote get-url upstream 2>/dev/null || git remote get-url origin`

## Linear First

Dedalus tracks issues in **Linear**. The issue templates (`.github/ISSUE_TEMPLATE/`) all
require a Linear link at the top. Unless the user explicitly says "no Linear" or supplies
`--linear N/A`, ask once for the Linear URL before creating the GitHub issue. If the user
is filing a public-facing issue and has no Linear, accept `N/A` and proceed.

## Template Selection

Parse the first positional arg from `$ARGUMENTS` as the issue type:

| Type     | Template file                              | Labels                |
|----------|--------------------------------------------|-----------------------|
| bug      | `.github/ISSUE_TEMPLATE/bug-report.yml`    | `bug,needs triage`    |
| feature  | `.github/ISSUE_TEMPLATE/feature_request.md`| `enhancement`         |
| question | `.github/ISSUE_TEMPLATE/question.md`       | `question`            |

The `bug-report.yml` file is a GitHub issue form. `gh issue create --body` submits plain
markdown, so translate the yaml form fields into a markdown body with the same section
headings (Linear Issue, Description, Steps to Reproduce, Expected Behavior, Component,
Environment, Additional Context).

For `feature_request.md` and `question.md`, read the file and replace the
`[Delete and type here].` placeholders with real content. Drop the `> [!IMPORTANT]` and
`> [!NOTE]` callouts; they are instructions to the filer, not issue content.

## Rules

- Issue title: short, imperative, no period, under 80 chars. No conventional-commit prefix
  (that's for PRs, not issues).
- The remaining positional args from `$ARGUMENTS` (after the type) form the title.
- If `--linear <url>` is in `$ARGUMENTS`, use it verbatim. Otherwise ask the user once.
- Use `gh issue create --title "..." --body "$(cat <<'EOF' ... EOF)" --label "..."`.
- Labels come from the table above. Do not invent new labels.
- If the user mentions a specific component in the title or body, set the Component
  field accordingly (bug template only).

## Task

1. Parse `$ARGUMENTS`:
   - First token: issue type (`bug`, `feature`, or `question`). If missing or invalid,
     ask the user which template to use.
   - Remaining tokens (excluding `--linear <url>`): title.
2. Resolve Linear URL: use `--linear` value or ask the user once.
3. Read the matching template file from `.github/ISSUE_TEMPLATE/`.
4. Fill every section. Leave no placeholder text. If a section truly has no content, write
   "N/A" rather than deleting the section.
5. Auto-inject the branch and last-commit context into "Additional Context" (bug) or
   "Context" (question) or the body tail (feature).
6. Run `gh issue create` with the right labels.
7. Return the issue URL.
