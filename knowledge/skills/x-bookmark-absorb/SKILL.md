---
name: x-bookmark-absorb
description: Deep absorption of X bookmarks into the wiki graph. Goes beyond hub-page entries to create dedicated pages, cross-references, resolver updates, and index entries. Use when Kevin says "absorb bookmarks", "process bookmarks", "bookmark absorption", "sync bookmarks to wiki", or when running the source-compile automation on x-bookmarks data. Also triggers after any `ft sync` / `sync-x-bookmarks.sh` run.
---

# X Bookmark Deep Absorption

Transform raw X bookmark data into full wiki graph integration — not just hub-page entries.

## The Problem This Solves

Shallow absorption: bookmarks get added to `x-bookmarks-*.md` hub pages but never propagate to dedicated tool/person pages, cross-references, resolvers, or the index. The wiki stays disconnected from the signal.

## When to Run

- After `ft sync` + `./scripts/sync-x-bookmarks.sh` adds new bookmarks
- When Kevin says "absorb bookmarks" or "process bookmarks"
- During `source-compile` automation runs targeting x-bookmarks
- When Kevin says bookmarks from a date range need processing

## The Pipeline

### Phase 1: Extract and Categorize

```bash
# Parse bookmarks.jsonl for the target date range
# Categorize each bookmark:
#   TOOL — new library, CLI, framework, skill, platform
#   DESIGN — typography, color, animation, layout, UI pattern
#   PERSON — notable individual (2+ mentions or high-signal take)
#   PHILOSOPHY — strong opinion, thesis, counter-signal
#   AI — agent tools, model announcements, agent UX
#   OTHER — lifestyle, ephemeral, low-signal
```

For each bookmark, extract: date, author handle+name, full text, links, engagement (likes, bookmarks), media type.

### Phase 2: Hub Page Entries (Level 1)

Route each bookmark to the correct hub page:

| Category | Hub Page |
|---|---|
| AI/agents | `wiki/tools/x-bookmarks-ai-agents.md` |
| Dev tools | `wiki/tools/x-bookmarks-dev-tools.md` |
| React/Next.js | `wiki/tools/x-bookmarks-react-nextjs.md` |
| CSS/frontend | `wiki/tools/x-bookmarks-css-frontend.md` |
| Design/UI | `wiki/design/x-bookmarks-design-ui.md` |
| 3D/shaders | `wiki/tools/x-bookmarks-3d-shaders.md` |
| Career/biz | `wiki/Career/x-bookmarks-career.md` |
| Dedalus | `wiki/projects/x-bookmarks-dedalus.md` |

Format: `### Title` block with quoted tweet, author attribution, date, engagement, and a `**Takeaway:**` line linking to relevant wiki pages.

### Phase 3: Dedicated Pages (Level 2)

A bookmark gets a dedicated page when ANY of these are true:

- **Tool/library announced** with >500 bookmarks or a working demo
- **Person page warranted** — notable individual mentioned 2+ times across sources OR single take with >5K likes from a builder with credibility
- **Concept/philosophy** — original thesis worth tracking over time
- **Existing wiki page should be updated** — the bookmark adds new info to an entity already in the wiki

Page creation follows `wiki/RESOLVER.md` decision tree. Use the standard page format from AGENTS.md.

### Phase 4: Cross-Reference Walk (Level 3)

For every dedicated page created or existing page updated:

1. **Search wiki for related pages** — `rg` for the entity name, author handle, related concepts
2. **Add timeline entries** to related pages that should know about this
3. **Update frontmatter `related:`** arrays on both the new and existing pages
4. **Add `[[wikilinks]]`** in body text where the entity is mentioned

### Phase 5: Registry Updates (Level 4)

If any bookmark introduces a tool that could enter Kevin's stack:

1. Check if it belongs in `config/cursor/rules/tool-hierarchy.mdc`
2. Check if it belongs in `wiki/SKILL-RESOLVER.md`
3. If it's a skill candidate, note it for evaluation (Brin + skill-auditor + reputation)

### Phase 6: Index and Log (Level 5)

1. Add new pages to `wiki/_index.md` (alphabetical within category, update counts)
2. Append to `wiki/log.md` with full absorption record
3. Run `npx tsx scripts/build-index.ts` if available

## Notability Gates

**Gets a dedicated page:**
- Tool/skill with >500 bookmarks or a GitHub repo with >100 stars
- Person with >10K followers AND a take >5K likes relevant to Kevin's domains
- Any tool Kevin's own tweet references (self-signal)
- Any entity mentioned across 2+ separate bookmarks

**Hub-page only (no dedicated page):**
- Ephemeral deals/promos (ChatGPT free months, etc.)
- Lifestyle/personal content (NYC photos, food, etc.)
- Low-engagement takes (<200 likes) from non-notable accounts
- Link-only tweets with no extractable content

**Skip entirely:**
- Retweets of content already captured
- Duplicate topics already well-covered in existing hub entries

## Quality Checklist

Before declaring absorption complete:

- [ ] Every bookmark from the date range is in at least one hub page
- [ ] Every notable bookmark has a dedicated page or existing page update
- [ ] Every new page is in `_index.md` with correct category and count
- [ ] Every person page has proper aliases (handle, @handle, full name)
- [ ] Cross-references flow BOTH directions (new→existing AND existing→new)
- [ ] `log.md` records what was created, updated, and why
- [ ] No orphan pages (every new page has at least one inbound link)
