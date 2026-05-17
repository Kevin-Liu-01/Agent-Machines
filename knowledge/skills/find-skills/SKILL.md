---
name: find-skills
description: Discover and install agent skills from skills.sh — the definitive open skills registry. Use when the user asks "how do I do X", "find a skill for X", "is there a skill for X", wants to extend agent capabilities, or when a task might benefit from a specialized skill you don't already have. Based on vercel-labs/skills (900K+ weekly installs).
---

# Find Skills

[skills.sh](https://skills.sh) is the definitive open registry for agent skills. Before solving a
specialized task from scratch, check if a battle-tested skill already exists.

## When to Use

- User asks "how do I do X" where X is a common domain task
- User says "find a skill for X" or "is there a skill for X"
- User asks "can you do X" where X is a specialized capability
- A task touches a domain you lack deep procedural knowledge in
- You want to extend capabilities with specialized workflows

## Skills CLI

```bash
npx skills find [query]     # Search for skills by keyword
npx skills add <source>     # Install a skill
npx skills add <source> -g -y  # Install globally, skip prompts
npx skills check            # Check for skill updates
npx skills update           # Update all installed skills
```

Browse the registry: https://skills.sh/

## How to Find the Right Skill

### 1. Understand the Need

Identify the domain (React, testing, design, deployment) and the specific task
(writing tests, creating animations, reviewing PRs).

### 2. Check the Leaderboard

Visit [skills.sh](https://skills.sh/) for the ranked leaderboard by total installs. Top
ecosystem sources:

| Source | Focus |
|---|---|
| `vercel-labs/skills` | React, Next.js, web design, find-skills |
| `vercel-labs/agent-skills` | React best practices, composition patterns |
| `anthropics/skills` | Frontend design, document processing |
| `microsoft/github-copilot-for-azure` | Azure services, cloud infrastructure |
| `coreyhaines31/marketingskills` | SEO audit, content strategy, pricing |
| `resciencelab/opc-skills` | SEO/GEO, programmatic SEO |
| `pbakaus/impeccable` | Design polish, critique, copywriting |
| `superagent-ai/skills` | Security, browser automation |

### 3. Search by Keyword

```bash
npx skills find react performance
npx skills find pr review
npx skills find changelog
npx skills find seo
```

### 4. Verify Quality Before Recommending

| Signal | Threshold |
|---|---|
| Weekly installs | Prefer 1K+. Cautious under 100. |
| Source reputation | Official sources (vercel-labs, anthropics, microsoft) preferred |
| GitHub stars | Under 100 stars = treat with skepticism |
| Security audits | Check the Gen Agent Trust Hub badge on skills.sh |

### 5. Present to User

Always show: skill name, what it does, install count, source, install command,
and a link to the skills.sh page for review.

### 6. Install

```bash
npx skills add <owner/repo> --skill <skill-name> -g -y
```

The `-g` flag installs globally (user-level), `-y` skips confirmation prompts.

## Kevin's Installed Skills

Skills live at `skills/personal/<name>/SKILL.md` for Cursor (loaded through the
`~/.cursor/skills` symlink) and `~/.codex/skills/<name>/SKILL.md` for Codex.

When installing new Cursor skills, install through Cursor normally, then make
sure the committed source lands under `skills/personal/`. After install, update
the wiki if the skill represents a new capability worth documenting.

## Common Skill Categories

| Category | Example Queries |
|---|---|
| Web Development | react, nextjs, typescript, css, tailwind |
| Testing | testing, jest, playwright, e2e |
| DevOps | deploy, docker, kubernetes, ci-cd |
| Documentation | docs, readme, changelog, api-docs |
| Code Quality | review, lint, refactor, best-practices |
| Design | ui, ux, design-system, accessibility |
| Marketing/SEO | seo, geo, content-strategy, copywriting |
| Productivity | workflow, automation, git |

## When No Skill Exists

1. Acknowledge no existing skill was found
2. Offer to help with the task directly
3. If it's a recurring need, suggest creating a custom skill at `skills/personal/`

## Related Skills

- `seo-audit` — comprehensive SEO auditing
- `seo-geo-optimization` — AI search engine optimization
- `content-strategy` — content planning and publishing
- `ultracite` — zero-config linting and formatting
