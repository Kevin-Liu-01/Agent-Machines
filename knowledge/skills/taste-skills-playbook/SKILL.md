---
name: taste-skills-playbook
description: Routing layer for the 13 taste-* design skills. Determines which visual-style skill fires for a given task and which workflow modifiers layer on top. Use when the user asks "which taste skill", "taste routing", "design skill selection", or when you need to decide between taste-soft, taste-minimalist, taste-brutalist, taste-gpt, or any other taste-* variant.
---

# Taste Skills Playbook

Routing layer for the 13 taste-* skills. Pick one visual-style skill per project, layer universal enforcement and workflow modifiers on top.

## Decision Tree

| Task | Primary skill | Layer with |
|------|--------------|-----------|
| "Build a landing page" (no style hint) | `taste-core` | `taste-output` if long file expected |
| "Premium SaaS landing page, Linear-tier" | `taste-soft` | `taste-imagegen-web` if visual-first |
| "Notion-style document UI", "workspace clone" | `taste-minimalist` | — |
| "Data dashboard", "terminal aesthetic" | `taste-brutalist` | — |
| "Image-first design then implementation" | `taste-image-to-code` | + style fork |
| "Generate website reference images" | `taste-imagegen-web` | feeds into `taste-image-to-code` |
| "Generate mobile screens" | `taste-imagegen-mobile` | — |
| "Brand kit", "logo concepts" | `taste-brandkit` | — |
| "Audit this site", "redesign without rewriting" | `taste-redesign` | + style fork for direction |
| "DESIGN.md for Google Stitch" | `taste-stitch` | — |
| Long output (multi-component) | `taste-output` | layered on every other skill |

## The One Style Per Project Rule

Never mix visual-style skills (soft/minimalist/brutalist/gpt) in the same project. They are archetypes, not feature sets. Workflow modifiers (image-to-code, imagegen-*, redesign, output) compose freely on top.

## Variance Dials

Three dials drive every taste skill. Defaults 8/6/4.

| Project | Variance | Motion | Density |
|---------|---------|--------|---------|
| Marketing landing page | 8 | 7 | 3 |
| Premium SaaS app | 6 | 5 | 5 |
| Data dashboard | 4 | 3 | 8 |
| Documentation site | 4 | 2 | 4 |
| Portfolio | 9 | 7 | 3 |

## Skill Graph

```
ALWAYS-ON: taste-enforcement.mdc (variance dials, banned patterns)
BASELINE:  taste-core + frontend-design-taste
STYLE:     taste-soft | taste-minimalist | taste-brutalist | taste-gpt (pick ONE)
WORKFLOW:  taste-image-to-code, taste-imagegen-web, taste-imagegen-mobile,
           taste-brandkit, taste-redesign, taste-stitch, taste-output (layer freely)
```

## Anti-Patterns

- Wrong-style adoption: agent picks `taste-soft` for a brutalist dashboard
- Style-skill stacking: loading multiple style skills simultaneously
- Skipping image-first: coding from text when visual reference would be better
- Cropping old images: always regenerate standalone images for re-analysis
- Truncated output: `taste-output` must layer on any task with >2 deliverables
