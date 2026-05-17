---
name: wiki-doctor
description: Run the wiki system doctor to validate wiki structure, skills, rules, automations, and config sync. Use when the user says "doctor", "audit", "health check", "validate wiki", "check my system", "run doctor", or when you suspect something is misconfigured after a large edit session.
---

# Wiki Doctor

Unified health check for Kevin's agent system. Validates five layers:
wiki structure, skills, rules, automations, and config sync.

## When to use

- After large wiki edits or ingests
- When something seems broken (rendering, missing skills, stale data)
- When Kevin says "doctor", "audit", "health check", "validate"
- Before committing wiki changes (quality gate)
- On a schedule (daily via Cursor automation)

## Commands

From the wiki repo root (`~/Documents/GitHub/kevin-wiki`):

```bash
# Run all doctors
npx tsx scripts/doctor.ts

# Run a specific doctor
npx tsx scripts/doctor.ts --only wiki        # frontmatter, wikilinks, index
npx tsx scripts/doctor.ts --only skills      # SKILL.md validity, symlinks
npx tsx scripts/doctor.ts --only rules       # .mdc integrity, hub refs
npx tsx scripts/doctor.ts --only automations # staleness, missing refs
npx tsx scripts/doctor.ts --only config-sync # symlink health

# JSON output (for programmatic use)
npx tsx scripts/doctor.ts --json
```

## What each doctor checks

### wiki-structure
- Every page has valid frontmatter (title required, type + created recommended)
- No broken `[[wikilinks]]`
- `_index.md` page count matches actual files
- `log.md` has valid YAML frontmatter

### skills
- Every `SKILL.md` under `skills/personal/`, `skills/claude/`, `skills/dedalus/` has frontmatter with `name` and `description`
- Symlinks from wiki repo to `~/.cursor/skills/` and `~/.claude/skills/` are intact
- No duplicate slugs across namespaces

### rules
- Every `.mdc` in `config/cursor/rules/` is non-empty
- Rules referenced in `agent-operations-hub.md` exist on disk
- Dedalus cursor rules are valid

### automations
- Every automation in `state.json` has run within 14 days
- Never-run automations are flagged

### config-sync
- All expected symlinks (`~/.cursor/rules`, `~/.cursor/skills`, `~/.claude/skills`, `hooks.json`, `mcp.json`) point to correct targets

## Interpreting results

| Severity | Meaning |
|----------|---------|
| pass | Check passed |
| warn | Non-critical issue, should be fixed when convenient |
| fail | Critical issue, fix before committing |

## After running

Results are written to `wiki/meta/doctor-results.json` and `state.json` is updated. If there are fails, fix them before committing. If there are warns, batch-fix during maintenance.

## Related

- `scripts/lint.ts` — older wiki-only lint (subset of wiki-structure doctor)
- `scripts/build-discovery.ts` — generates `wiki/meta/discovery-index.json` and `wiki/llms.txt`
- `scripts/check-freshness.ts` — sync + automation staleness checks
