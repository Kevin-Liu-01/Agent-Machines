---
name: automation-cron
description: "Schedule recurring agent tasks with the cronjob tool. Use when the user wants something to run on a schedule, when you finish a task that should recur, or when planning daily/weekly automations."
version: 1.0.0
author: Kevin Liu
license: MIT
metadata:
  agent-machines:
    tags: [cron, automation, scheduling, recurring]
---

# Automation via Cron

I can schedule recurring tasks via the `cronjob` tool. They run as fresh agent sessions on the gateway scheduler, with results delivered back to the originating chat or to configured platforms.

## Schedule formats

Hermes accepts both natural language and crontab syntax:

```
"every 1h"
"every 30m"
"every 2h"
"every 1d at 09:00"
"daily at 04:00"
"every monday at 09:00"
"0 9 * * *"           # crontab -- daily at 09:00 UTC
"30 */4 * * *"        # crontab -- every 4 hours at :30
```

## Creating a job

Three surfaces, same effect:

```bash
# CLI
agent-machines cron create "every 1h" "Summarize new feed items" --skill blogwatcher --name "Hourly feeds"

# In-chat slash command
/cron add "0 9 * * *" "Audit my open PRs and post a summary"

# In a tool call
cronjob(
    action="create",
    schedule="every 1d at 09:00",
    prompt="Summarize my last 24 hours of commits across all projects",
    name="Daily commit digest",
    skills=["git-workflow"],
)
```

## Skill-backed jobs

A cron job can preload one or more skills before running its prompt. Skills are loaded in order; the prompt becomes the task instruction layered on top.

Use this when the job needs a recurring procedure (e.g. blogwatcher checks feeds, llm-wiki updates a knowledge base).

## Workdir scoping

By default cron jobs run detached from any repo. Pass `workdir` to load `AGENTS.md` / `CLAUDE.md` and run terminal/file tools rooted in that directory:

```python
cronjob(
    action="create",
    schedule="every 1d at 09:00",
    workdir="/home/machine/projects/dedalus-monorepo",
    prompt="Audit open PRs, summarize CI health, and post to #eng",
)
```

The path must be absolute and exist; relative paths are rejected.

## Operations

```
cronjob action=list          # show all jobs
cronjob action=pause id=...  # pause a job
cronjob action=resume id=... # resume a job
cronjob action=run id=...    # trigger immediately
cronjob action=remove id=... # delete a job
cronjob action=update id=... # edit schedule, prompt, skills, or workdir
```

## Recursion guard

Cron-run sessions cannot themselves create more cron jobs. Hermes disables `cronjob` inside cron executions to prevent runaway scheduling loops. If you want a job to spawn other jobs, do it via direct tool calls in chat instead.

## Patterns I run by default

These ship with the deployment and run automatically:

- **Hourly health check** -- verify the API server is responsive, restart the gateway if not.
- **Daily wiki digest** -- summarize what changed in `~/Documents/GitHub/my-wiki` and post to chat.
- **Weekly skill audit** -- review my own skills folder, flag stale or duplicated entries.
- **Nightly memory consolidation** -- fold redundant entries in MEMORY.md, prune to fit the character limit.

## When I propose a new cron

If the user describes a task that would benefit from recurrence ("every morning, check X"), I propose a cron with the exact `cronjob action=create` call before scheduling, so they can approve the schedule and prompt. Never add a cron silently.
