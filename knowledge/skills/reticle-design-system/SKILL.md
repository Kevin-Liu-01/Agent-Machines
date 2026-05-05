---
name: reticle-design-system
description: "Reticle/Sigil design system reference. Use when generating UI for a project that uses this design system -- provides token names, layout primitives (margins, gutters, crosses), typography, and component patterns. Drop in your own design-system skill to replace it."
version: 1.0.0
author: Kevin Liu
license: MIT
metadata:
  hermes:
    tags: [design-system, reticle, sigil, tokens, layout]
    related_skills: [frontend-design-taste]
---

# Reticle / Sigil Design System

A structural-visibility aesthetic inspired by engineering instruments: grid lines, margin rails, and cross marks at intersections make the layout grid visible as a design element.

## Tokens (CSS custom properties)

```css
:root {
  --ret-bg:                #ffffff;
  --ret-bg-soft:           #f0f0f2;
  --ret-surface:           #f5f5f5;
  --ret-surface-hover:     #ebebeb;
  --ret-text:              rgba(0,0,0,0.90);
  --ret-text-secondary:    #52525b;
  --ret-text-dim:          rgba(0,0,0,0.55);
  --ret-text-muted:        rgba(0,0,0,0.35);
  --ret-border:            rgba(0,0,0,0.22);
  --ret-border-hover:      rgba(0,0,0,0.36);
  --ret-border-strong:     rgba(0,0,0,0.42);
  --ret-grid:              rgba(0,0,0,0.14);
  --ret-rail:              rgba(0,0,0,0.18);
  --ret-cross:             rgba(0,0,0,0.30);
  --ret-purple:            #AAA5E6;
  --ret-purple-glow:       rgba(170,165,230,0.10);
  --ret-green:             #22c55e;
  --ret-amber:             #f59e0b;
  --ret-red:               #ef4444;
}
.dark {
  --ret-bg:                #09090b;
  --ret-bg-soft:           #111113;
  --ret-surface:           #111113;
  --ret-surface-hover:     #1a1a1e;
  --ret-text:              rgba(255,255,255,0.90);
  --ret-text-secondary:    #a1a1aa;
  --ret-text-dim:          rgba(255,255,255,0.50);
  --ret-text-muted:        rgba(255,255,255,0.30);
  --ret-border:            rgba(255,255,255,0.16);
  --ret-border-hover:      rgba(255,255,255,0.26);
  --ret-border-strong:     rgba(255,255,255,0.32);
  --ret-grid:              rgba(255,255,255,0.08);
  --ret-rail:              rgba(255,255,255,0.14);
  --ret-cross:             rgba(255,255,255,0.22);
  --ret-purple:            #D2BEFF;
  --ret-green:             #4ade80;
  --ret-amber:             #fbbf24;
  --ret-red:               #f87171;
}
```

Components consume only `var(--ret-*)`, never raw values.

## Sizes

```ts
export const RETICLE_SIZES = {
  gridCell: 48,
  crossArm: 10,
  crossStroke: 1.5,
  railGap: 24,
  contentMax: 1280,
  cardRadius: 10,
} as const;
```

## Page grid (the macro layout)

Every page is a 5-column CSS grid:

```
margin | gutter | content | gutter | margin
1fr    | 24px   | min(0, 1280px) | 24px | 1fr
```

The margins and gutters render the grid lines that define the aesthetic. The center content column is where actual content lives. Gutters show grid cells (48x48); margins show repeating horizontal lines at 16px intervals.

`<ReticlePageGrid>` provides this for the whole document. `<ReticleSection>` auto-detects when it's nested and skips re-rendering the columns.

## Components

| Component | Role |
|-----------|------|
| `ReticlePageGrid` | Top-level 5-column grid. Wrap the entire app. |
| `ReticleSection` | A page section with optional border-top + content padding. |
| `ReticleNavbar` | Sticky nav with backdrop-blur, integrated into the grid. |
| `ReticleCard` | Bordered surface, `cardRadius=10`, hoverable border. |
| `ReticleButton` | `primary` (purple), `secondary` (border), `ghost` (no chrome). |
| `ReticleBadge` | Pill with mono font. Variants: `default`, `accent`, `success`, `warning`. |
| `ReticleLabel` | UPPERCASE MONO TRACKING-WIDE muted text. Section headings. |
| `ReticleHRule` | Horizontal divider. Optional center accent shape. |
| `ReticleGrid` + `ReticleGridCell` | Cell-bordered grid. `columns: 2 \| 3 \| 4`. |
| `ReticleCross` | The `+` mark drawn at structural intersections. |

## Typography rules

- Headings: clean sans-serif, e.g. `"Geist Sans"`, `"Inter"`, system stack.
- Mono everywhere structural matters: labels, badges, code, metrics, IDs. `"Geist Mono"`, `"JetBrains Mono"`, system mono.
- Tracking on labels: `tracking-[0.2em]` uppercase.
- Body text: `text-[var(--ret-text)]`. Dim text: `text-[var(--ret-text-dim)]`. Muted: `text-[var(--ret-text-muted)]`.

## Authoring rules

1. **No raw colors.** Always reference `var(--ret-*)`.
2. **Borders, not shadows.** Use `border border-[var(--ret-border)]`. Box-shadows only for purple glow on primary buttons.
3. **Mono for technical, sans for prose.** Mix freely; mono signals "system fact", sans signals "narrative".
4. **Cross marks are structural.** Place them at the intersections of the page grid and content, never decoratively.
5. **Border radius is 10px.** Defined by `--ret-card-radius`. Don't deviate.
6. **One purple, used sparingly.** Primary CTAs only. Never multiple purple regions per page.

## Page composition pattern

```tsx
<ReticlePageGrid>
  <ReticleNavbar variant="full">{/* logo + links */}</ReticleNavbar>

  <ReticleSection borderTop={false} contentClassName="py-24">
    <ReticleLabel>HERO</ReticleLabel>
    <h1 className="mt-3 text-5xl font-semibold tracking-tight">...</h1>
    <p className="mt-4 max-w-prose text-[var(--ret-text-dim)]">...</p>
    <div className="mt-8 flex gap-3">
      <ReticleButton variant="primary">Deploy</ReticleButton>
      <ReticleButton variant="secondary">Read docs</ReticleButton>
    </div>
  </ReticleSection>

  <ReticleSection>
    <ReticleLabel>FEATURES</ReticleLabel>
    <ReticleGrid columns={3}>
      <ReticleGridCell>...</ReticleGridCell>
    </ReticleGrid>
  </ReticleSection>
</ReticlePageGrid>
```
