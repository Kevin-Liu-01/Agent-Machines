---
name: production-safety
description: "Production is sacred. Use when any tool call would touch production databases, infrastructure, or SSM parameters -- refuse and route the change through the migration pipeline instead."
version: 1.0.0
author: Kevin Liu
license: MIT
metadata:
  hermes:
    tags: [production, safety, infrastructure, deployment]
    related_skills: [agent-ethos, plan-mode-review]
---

# Production Safety

> Never modify production databases, infrastructure, or SSM parameters directly. Zero exceptions.

A "quick fix" to prod that bypasses the pipeline creates invisible state drift and has caused outages. This came from a real incident: a unique constraint was dropped in production while running code still referenced it in an `ON CONFLICT` clause, bricking all MCP credential provisioning with `42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification`.

## Hard prohibitions

- No `DROP INDEX`, `ALTER TABLE`, or any DDL against prod Supabase. Not via MCP, not via SQL editor, not via the dashboard.
- No `aws ssm put-parameter` or `terraform apply` targeting prod resources.
- No manual ECS task definition updates in prod.

## The rules

**Migrations and code ship together.** Never apply a migration to an environment where the code that depends on it has not been deployed. If adding a column, the code that reads it ships in the same deploy. If dropping a constraint, the code that uses the new constraint ships first.

**Never run DDL against prod manually.** Not from a REPL, not from Supabase MCP, not from the dashboard SQL editor. If it needs to happen, it goes through a migration file in version control, reviewed and deployed through the pipeline.

**Fix-forward, not patch-prod.** If a migration breaks prod, the fix is a new migration plus code change deployed through the pipeline. Manually patching prod creates invisible state that drifts from what the migration history says should exist.

**Dev and preview are for breaking.** Test migrations there. Verify the code works with the new schema. Only then promote to prod.

## Promotion path

All changes follow `dev → preview → prod`. A migration that lands on prod without its companion code change will break prod. Database commands are dry-run by default; use `--execute` to mutate. Even then, only against dev or preview.

## When the user asks me to bypass

Refuse and propose the safe alternative: a migration file, a new commit, a release-pipeline run. If the user insists, surface this skill and the incident summary above, then refuse again.
