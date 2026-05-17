---
name: doctor-enforcement
description: Auto-run the relevant codebase doctor(s) after large edit sessions or before committing. Detects which subsystems were touched and runs the matching doctor. Use when the agent has completed a significant edit (5+ files), before claiming work is done, or when the user says "run doctors", "health check", "doctor pass", or "check everything."
---

# Doctor Enforcement

After a significant edit session, detect which subsystems were touched and run the relevant doctor(s) before reporting completion.

## Trigger Conditions

Run this skill when ANY of the following are true:

- Agent edited 5+ files in a single session
- Agent touched files across multiple packages in a monorepo
- User says "run doctors", "health check", "doctor pass", "check everything"
- Agent is about to claim a task is complete
- Session involved framework migration, dependency updates, or config changes

## Detection Logic

Check `git diff --name-only` (staged + unstaged) to determine which doctors to run:

| Files changed match | Run |
|---------------------|-----|
| `wiki/**`, `skills/**`, `config/**` | `npx tsx scripts/doctor.ts` (wiki-doctor) |
| `*.tsx`, `*.jsx`, `components/**`, `app/**`, `pages/**` | `npx react-doctor@latest` |
| `package.json`, `tsconfig.*`, monorepo config | `npx @sylphx/doctor` (if monorepo) |
| Any frontend files | `agent-browser vitals <url>` (if dev server running) |
| `*.tf`, `infra/**` | Project-specific infra doctor |

## Execution

```bash
# 1. Detect what changed
git diff --name-only HEAD

# 2. Run matching doctors (examples)
npx tsx scripts/doctor.ts                    # wiki edits
npx react-doctor@latest                      # React edits
npx @sylphx/doctor                           # monorepo structure
agent-browser vitals http://localhost:3000    # frontend running

# 3. Report results
# If any doctor returns failures: fix before committing
# If warnings only: report to user, commit is OK
# If all pass: proceed
```

## After Running

1. Report the health score(s) to the user
2. If failures exist, fix them before claiming completion
3. If warnings exist, mention them but don't block
4. If the project doesn't have a relevant doctor, suggest adding one

## Rules

- Never skip doctors to save time. The 30 seconds a doctor takes prevents hours of debugging.
- If a doctor check fails, fix the root cause — don't suppress the check.
- If a failure pattern isn't caught by any existing doctor, propose a new check.
- In monorepos, run ALL doctors for changed surfaces, not just the one you think is relevant.

## Related

- `wiki/concepts/doctor-pattern.md` — the pattern definition and registry
- `wiki/concepts/lint-enforced-agent-guardrails.md` — enforcement hierarchy
- `skills/personal/wiki-doctor/SKILL.md` — wiki-specific doctor
