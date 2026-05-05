---
name: frontend-design-taste
description: "Anti-slop frontend rules. Use when generating UI code, reviewing components, or deciding visual direction -- bans the AI-default aesthetics and enforces variance, taste, and motion discipline."
version: 1.0.0
author: Kevin Liu
license: MIT
metadata:
  hermes:
    tags: [frontend, design, anti-slop, taste, animation]
    related_skills: [reticle-design-system]
---

# Frontend Design Taste

The default LLM aesthetic -- centered hero with blur blobs, three equal cards, AI purple gradients, glassmorphism on white -- is generic. This skill is the override.

## Variance dials

Treat every UI request as having three dials. Pick values from context.

| Dial | Range | Default | Reads |
|------|-------|---------|-------|
| `DESIGN_VARIANCE` | 1-10 | 8 | Layout asymmetry, grid complexity, whitespace |
| `MOTION_INTENSITY` | 1-10 | 6 | Animation density, spring physics, scroll effects |
| `VISUAL_DENSITY` | 1-10 | 4 | Spacing tightness, card usage, data presentation |

User says "make it airy" → `VISUAL_DENSITY=2`. "Dashboard" → `7-8`. "Cinematic" → `MOTION_INTENSITY=8-9`.

At `DESIGN_VARIANCE 8-10`: masonry, fractional grid units (`2fr 1fr 1fr`), massive empty zones. Mobile collapse mandatory.

## Banned patterns (hard failures)

**Layout**

- Centered hero + blur blobs when `DESIGN_VARIANCE > 4`. Use split-screen, left-aligned, asymmetric.
- Three equal cards in a row. Use bento, zig-zag, or asymmetric grid.
- `h-screen` → always `min-h-[100dvh]`.
- Flexbox percentage math → use CSS Grid.

**Color & surface**

- "AI Purple/Blue" aesthetic. No purple glows, neon gradients.
- Pure `#000000` for backgrounds or text. Use off-black.
- Oversaturated accents. Desaturate to blend.
- Glassmorphism on white without justification.
- Neon outer glows via default box-shadow.

**Typography**

- Inter, Roboto, Open Sans as primary typeface.
- Oversized H1s that scream instead of communicate hierarchy.
- Serif on dashboards (serif is editorial/creative only).
- More than three font families.

**Content**

- Generic names ("John Doe", "Acme Corp") → realistic, contextual names.
- Generic avatars (SVG eggs) → styled initials or photos.
- Round-number lies (`99.99%`, `50%`) → organic data (`47.2%`).
- Startup slop ("Nexus", "SmartFlow", "Elevate", "Seamless").
- Lorem ipsum in visible UI.
- Emoji in code, markup, or content.

**External**

- Unsplash links → `picsum.photos/seed/{context}/W/H`.
- Lucide/Feather → Phosphor (Bold/Fill) or Radix Icons.
- Default shadcn/ui without customization.

## Required UI states

| State | Implementation |
|----|---|
| Loading | Skeletal loaders matching layout dimensions |
| Empty | Composed empty state with guidance, not just text |
| Error | Inline error reporting, not a generic toast |
| Active/Pressed | `-translate-y-[1px]` or `scale-[0.98]` |
| Hover | Meaningful change, not just opacity |

## Motion discipline

Animate only `transform` and `opacity` (hardware acceleration). Spring physics for any meaningful animation: `type: "spring", stiffness: 100, damping: 20`. Linear easing is banned.

Stagger children: `staggerChildren` in Motion or CSS `animation-delay: calc(var(--index) * 80ms)`.

`useMotionValue` + `useTransform` for magnetic hovers. Never `useState` for motion.

`IntersectionObserver` over scroll listeners. `will-change: transform` only on active animations. Cleanup every effect.

## Output completeness

Banned: `// ...`, `// TODO`, `// implement here`, "for brevity", skeleton functions presented as full implementations. If a generation hits a token limit, split it deterministically across multiple file outputs -- never abridge.

## Pre-ship taste check

- [ ] No banned visual patterns
- [ ] No generic names, numbers, or placeholders
- [ ] No AI copywriting clichés
- [ ] Loading + empty + error states implemented
- [ ] Spring physics on interactive animations
- [ ] Staggered reveals on lists/grids
- [ ] Mobile collapse for high-variance layouts
- [ ] No `h-screen` -- only `min-h-[100dvh]`
