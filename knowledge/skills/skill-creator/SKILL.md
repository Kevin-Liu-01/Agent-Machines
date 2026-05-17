---
name: skill-creator
description: Create, test, and iteratively improve agent skills with structured evaluation. Use when creating a new skill, turning a workflow into a skill, improving an existing skill, or when the user says "create a skill", "make a skill", "turn this into a skill", "skill for X", or "improve this skill." Based on anthropics/skills (134K weekly installs). Wiki-aware — always checks the wiki before creating skills and updates the wiki after.
---

# Skill Creator

Create new skills and iteratively improve them. Wiki-aware variant that integrates with Kevin's LLM Wiki.

## Wiki-First Protocol

Before creating any skill:

1. **Check the wiki.** Read `wiki/_index.md` and search for pages related to the skill's domain. Existing wiki pages contain Kevin's compiled knowledge and preferences.
2. **Check skills.sh.** Use the `find-skills` skill to search for existing upstream skills. Prefer adapting an upstream skill over building from scratch.
3. **Check installed skills.** Scan `skills/personal/`, `skills/claude/`, and `skills/dedalus/` for overlap. Don't create a skill that duplicates an existing one.

After creating a skill:

1. **Update `wiki/tools/skills-sh.md`** — Add the new skill to the installed skills table
2. **Update `AGENTS.md`** — Add to the installed skills table in the Skills section
3. **Update `wiki/log.md`** — Record what was created and why
4. **Cross-reference** — Update related wiki pages with links to the new skill
5. **Rebuild index** — Run `npx tsx scripts/build-index.ts`

## Skill Creation Process

### 1. Capture Intent

- What should this skill enable the agent to do?
- When should it trigger? (specific user phrases and contexts)
- What's the expected output format?
- Does an upstream skill on skills.sh already cover this? (check first)

### 2. Interview and Research

- Ask about edge cases, input/output formats, success criteria, dependencies
- Check wiki pages for existing knowledge on the topic
- Check skills.sh for similar skills that could be adapted

### 3. Write the SKILL.md

Install Cursor/personal skills to `skills/personal/<name>/SKILL.md` (loaded through the `~/.cursor/skills` symlink). Required structure:

```yaml
---
name: skill-name
description: What it does and when to trigger. Be pushy — include specific trigger phrases.
---
```

**Skill anatomy:**

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description required)
│   └── Markdown instructions
└── Bundled Resources (optional)
    ├── scripts/     - Executable code for deterministic tasks
    ├── references/  - Docs loaded into context as needed
    └── assets/      - Templates, icons, fonts
```

### 4. Writing Guidelines

- Keep SKILL.md under 500 lines; use `references/` for overflow
- Explain the **why** behind instructions — LLMs respond better to reasoning than rigid MUSTs
- Include examples with concrete input/output
- Make descriptions slightly "pushy" to prevent under-triggering
- Always include a "Related Skills" section at the bottom
- Always reference relevant wiki pages where applicable (e.g., "Read `wiki/design/design-system.md` for current tokens")

### 5. Description Optimization

The description field is the primary triggering mechanism. Include:
- What the skill does
- Specific contexts for when to use it
- Trigger phrases users might say
- Upstream source attribution if based on a skills.sh skill

### 6. Testing

After writing, create 2-3 realistic test prompts:
- Something a real user would actually type
- Include edge cases and near-misses
- Test trigger accuracy (should-trigger vs should-not-trigger)

### 7. Wiki Integration (Mandatory)

After creating the skill, always:

```bash
# Update the installed skills table in AGENTS.md
# Update wiki/tools/skills-sh.md
# Append to wiki/log.md
# Rebuild backlinks
npx tsx scripts/build-index.ts
```

## Key Principles

- **Upstream first** — Check skills.sh before building from scratch
- **Wiki-aware** — Reference wiki pages for domain context
- **Focused** — One skill per concern, under 500 lines
- **Explain why** — Reasoning over rigid rules
- **Pushy descriptions** — Prevent under-triggering
- **Progressive disclosure** — Metadata always in context, references loaded on demand
- **Test** — Verify trigger accuracy with realistic prompts

## Related Skills

- `find-skills` — Search skills.sh for existing skills
- `content-strategy` — Example of a personalized skill with upstream references
- `vercel-react-best-practices` — Example of an upstream skill adapted for local use
