---
name: reticle-aesthetic
description: >-
  Build landing page sections, hero blocks, and marketing surfaces in the
  Reticle/Sigil engineering-instrument-grid aesthetic. Use when creating new
  landing sections, hero components, marketing pages, or when the user says
  "reticle", "hero", "landing page", "new section", "instrument panel",
  "grid cell", or wants to match the existing Agent Machines visual language.
---

# Reticle / Sigil Aesthetic

The Agent Machines landing page is an **engineering instrument panel** —
hairline borders, hatched margin rails, corner cross marks, monospaced
readouts, and agent-colored hover overlays on a near-black (dark) or white
(light) ground. Animation budget is minimal: hand-rolled React timers, CSS
keyframes, and R3F wireframes. No GSAP, no Framer Motion.

## Design Tokens

All colors use `var(--ret-*)` from `web/app/globals.css`. Never use raw hex
for backgrounds/borders/text — always resolve through tokens.

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `--ret-bg` | `#ffffff` | `#09090b` | Page ground |
| `--ret-bg-soft` | `#f0f0f2` | `#111113` | Recessed panels |
| `--ret-bg-mid` | `#f7f7f8` | `#0d0d0f` | Mid-layer cards |
| `--ret-surface` | `#f5f5f5` | `#111113` | Interactive surface |
| `--ret-text` | `rgba(0,0,0,0.9)` | `rgba(255,255,255,0.9)` | Primary text |
| `--ret-text-dim` | `rgba(0,0,0,0.55)` | `rgba(255,255,255,0.5)` | Secondary |
| `--ret-text-muted` | `rgba(0,0,0,0.35)` | `rgba(255,255,255,0.3)` | Tertiary |
| `--ret-border` | `rgba(0,0,0,0.22)` | `rgba(255,255,255,0.16)` | Hairlines |
| `--ret-rail` | `rgba(0,0,0,0.18)` | `rgba(255,255,255,0.14)` | Hatch lines |
| `--ret-cross` | `rgba(0,0,0,0.3)` | `rgba(255,255,255,0.22)` | Cross marks |
| `--ret-purple` | `#aaa5e6` | `#d2beff` | Brand accent |
| `--ret-green` | `#22c55e` | `#4ade80` | Status: live |

**Agent hues** (dynamic, applied via inline `style`):
- Hermes: `#7c8cf8`
- OpenClaw: `#e5443b`
- Claude: `#d4a574`
- Codex: `#4ae0a0`
- Cursor: `#f5c542` / `var(--ret-purple)`

## Typography

- **Body/UI:** Nacelle (`--font-sans`) — 14px base, `font-feature-settings: "ss01", "cv11", "tnum"`
- **Headlines:** `.ret-display` — `font-weight: 600; letter-spacing: -0.02em; line-height: 1.05`
- **Editorial serif:** `.ret-serif` — Instrument Serif italic, reserved moments only
- **Labels:** `ReticleLabel` — 11px, uppercase, `tracking-[0.2em]`, `--ret-text-muted`
- **Mono:** `--font-mono` — Geist Mono / JetBrains Mono stack
- **Fluid headings:** `text-[clamp(2rem,5.5vw,4.5rem)]`

## Layout Constants

- `--ret-content-max: 1200px` — centered content column
- `--ret-rail-offset: 4rem` — hatched margin width
- `--ret-card-radius: 0px` — sharp outer edges everywhere
- Inner cards use `rounded-lg` — the inset instrument look

## Page Shell

```tsx
<ReticlePageGrid>        {/* hatched margins + overflow-x: clip */}
  <ReticleNavbar />      {/* sticky, backdrop-blur */}
  <main>
    <ReticleSection>     {/* content max 1200px */}
      {/* section content */}
    </ReticleSection>
    <ReticleSpacer />    {/* hairline + corner crosses */}
    {/* next section... */}
  </main>
  <Footer />
</ReticlePageGrid>
```

Margin rails: `repeating-linear-gradient(45deg, var(--ret-rail) 0 1px, transparent 1px 6px)`

## Grid Construction

Hero and feature sections use CSS Grid with a narrow left rail + N content columns:

```tsx
<div className="grid grid-cols-4 auto-rows-auto md:grid-cols-[4.5rem_repeat(7,1fr)_4.5rem]">
```

- Column 1: narrow rail (agent selector or tool clusters)
- Columns 2–8: content cells
- Column 9: right edge rail
- Mobile: `grid-cols-4`, hide rail + rightmost cells with `hidden md:block`

## Cell Component (core primitive)

Every grid cell — even empty decorative ones — wraps in `Cell`:

```tsx
<Cell
  action="provisioning VM..."   // monospaced action label
  agent={agent}                 // current active agent
  hue={hue}                     // current agent color
  hoverVisual={<HoverGlow color={hue} />}
  cellAgent={CELL_AGENTS[0]}    // which agent "owns" this cell
  toolIcon="shell"              // optional tool/service icon
>
  {children}
</Cell>
```

**Cell anatomy:**
- Outer: `border-b border-r border-[var(--ret-border)]` — hairline on bottom + right
- Hover overlay: `absolute inset-[6px] rounded-lg opacity-0 → opacity-100`
  - Tinted background: `${ca.hue}0a`
  - Visual effect fills the overlay
  - Pulsing dot: top-right, `animate-pulse`, agent hue + `boxShadow`
  - Agent label: bottom-left (logo + service/tool icon)
  - Action string: bottom-right, `font-mono text-[8px]`, agent hue

**Border deduplication:**
- Last column: `!border-r-0`
- Last row: `!border-b-0`
- Adjacent to full-bleed hairline: remove matching border

## Cards Inside Cells

```tsx
<Cell ...>
  <div className="h-full p-1.5">
    <div className="h-full rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg)]">
      {/* content */}
    </div>
  </div>
</Cell>
```

- Padding: `p-1.5` (6px)
- Card: `rounded-lg border border-[var(--ret-border)] bg-[var(--ret-bg)]`
- 3D viewports: use `bg-[var(--ret-bg-soft)]` + corner cross marks
- Decorative/empty cells: same card structure, add nyx-lines texture at `opacity-0 dark:opacity-20`

## Full-Width Hairline System

Hairlines are the dominant structural element — they appear at **every** level
of the hierarchy: between page sections, inside component grids, as cell
borders, and as full-bleed rules that escape their container. The system has
four distinct mechanisms that work together:

### 1. Page-level spacers (`ReticleSpacer`)

Between every major section. A full-width `border-y` strip with `+` cross
marks pinned at the content-column edges:

```tsx
<ReticleSpacer />           {/* 20px hairline strip + 4 corner crosses */}
<ReticleSpacer hatch />     {/* same, but filled with 45° hatch pattern */}
```

Implementation:
```tsx
<div
  className="relative w-full border-y border-[var(--ret-border)]"
  style={{ height: "20px" }}
  aria-hidden="true"
>
  {/* Optional hatch fill */}
  {hatch && (
    <div className="absolute inset-0 opacity-60" style={{
      backgroundImage: "repeating-linear-gradient(45deg, var(--ret-rail) 0 1px, transparent 1px 6px)"
    }} />
  )}
  {/* Cross marks at content-column intersections */}
  <ReticleCross style={{ top: "-5px", left: "calc(50% - var(--ret-content-max) / 2 - 5px)" }} />
  <ReticleCross style={{ top: "-5px", right: "calc(50% - var(--ret-content-max) / 2 - 5px)" }} />
  <ReticleCross style={{ bottom: "-5px", left: "..." }} />
  <ReticleCross style={{ bottom: "-5px", right: "..." }} />
</div>
```

The crosses are SVG `+` marks (`ReticleCross`) — two perpendicular lines
stroked in `var(--ret-cross)`, sized at `crossArm * 2` (default 10px),
centered exactly on the hairline/column intersection.

### 2. Full-bleed hairlines inside components

When a hairline must span the entire viewport width (not just the content
column), use absolute positioning with `200vw` width centered at `-50vw`:

```tsx
<div
  className="pointer-events-none absolute top-0 z-30 h-px"
  style={{ left: "-50vw", width: "200vw", background: "var(--ret-border)" }}
/>
```

Used in the hero heading card (top + bottom), and anywhere a cell needs
a rule that visually connects to the page-grid margin rails. The page shell
uses `overflow-x: clip` (not `hidden` — `clip` doesn't create a new stacking
context) so these extend to viewport edges cleanly.

**When to use:** A cell or component needs a line that reads as part of the
page structure, not just its own border. The heading card uses two of these
to create a band that reads as a full-width stripe.

**Deduplication:** Cells adjacent to a full-bleed hairline must remove their
own matching border: `!border-t-0` or `!border-b-0`.

### 3. Inline horizontal rules (`ReticleHRule`)

Section-internal dividers with four variants:

```tsx
<ReticleHRule variant="plain" />   {/* single hairline, edge to edge within content */}
<ReticleHRule variant="cross" />   {/* hairline with + mark in center (default) */}
<ReticleHRule variant="hatch" />   {/* border-y strip filled with 45° hatch, h-6 */}
<ReticleHRule variant="label">AGENTS</ReticleHRule>  {/* hairlines flanking centered text */}
```

The "label" variant creates the pattern:
```
─────────── AGENTS ───────────
```
Using `h-px flex-1 bg-[var(--ret-border)]` on both sides of the text.

### 4. Cell-level borders (grid lines)

Every `Cell` in the hero/feature grids contributes to the grid-line mesh:

```tsx
className="border-b border-r border-[var(--ret-border)]"
```

This creates a continuous grid of hairlines where:
- Each cell draws its **bottom** and **right** border
- The grid container has no padding — cells are edge-to-edge
- Edges are deduplicated: last column gets `!border-r-0`, last row gets `!border-b-0`
- `border-y` or `border-t` on hatch accent strips within components (e.g. FleetDemo's 1px hatch bar)

### 5. Component-internal hairlines

Inside cards and panels, hairlines separate zones:

```tsx
{/* Dashed internal divider */}
<div className="border-b border-dashed border-[var(--ret-border)]" />

{/* Solid footer divider */}
<div className="border-t border-[var(--ret-border)]" />

{/* Hatch accent strip (1px tall) */}
<div className="relative h-1 w-full overflow-hidden border-y border-[var(--ret-border)]">
  <div className="absolute inset-0 opacity-40" style={{
    backgroundImage: "repeating-linear-gradient(45deg, var(--ret-rail) 0 1px, transparent 1px 6px)"
  }} />
</div>
```

**Dashed vs solid:** Dashed borders (`border-dashed`) are used **only** for
internal card subdivisions (resource stats, identity rows) and the rules
flanking headline text. All structural/grid borders are solid.

### 6. Framed panels (`ReticleFrame`)

Bordered container with `+` cross marks pulled outside the border at all
four corners:

```tsx
<ReticleFrame className="p-6">
  {children}
</ReticleFrame>
```

Implementation: `border border-[var(--ret-border)] bg-[var(--ret-bg)]` with
four `ReticleCross` positioned at `-10px` (crossOffset) from each corner so
the `+` center sits exactly on the corner point.

### Hierarchy summary

```
Viewport edge
│
├─ ReticlePageGrid margin rails (absolute, full-height, hatched)
│   │
│   ├─ ReticleSpacer (border-y, full content-width, + crosses at column edges)
│   │
│   ├─ Full-bleed hairlines (200vw absolute, escapes content column)
│   │
│   ├─ ReticleHRule (content-width, with cross/hatch/label variants)
│   │
│   ├─ Cell borders (border-b + border-r, forms grid mesh)
│   │
│   └─ Component internals (border-t, border-b, border-dashed for subdivisions)
│
└─ overflow-x: clip on page shell (clips rails + bleed hairlines at viewport)
```

### Rules for new hairlines

1. **Between sections** → `<ReticleSpacer />` (always, never skip)
2. **Inside a section, full-bleed** → absolute `h-px` + `200vw` + `z-30`
3. **Inside a section, content-width** → `<ReticleHRule variant="..." />`
4. **Grid cells** → `border-b border-r` on each cell, deduplicate edges
5. **Inside a card** → `border-t` or `border-b` (solid for structure, dashed for subdivision)
6. **Accent strips** → `h-1 border-y` with hatch fill at reduced opacity
7. **Never** use `<hr>` directly — always use a Reticle primitive

## Hover Visual Primitives

| Primitive | Effect | Code pattern |
|-----------|--------|--------------|
| `HoverHatch` | Repeating diagonal lines | `repeating-linear-gradient(${angle}deg, ${color}18 0 1px, transparent 1px 6px)` |
| `HoverGlow` | Radial gradient from center | `radial-gradient(circle at center, ${color}15 0%, transparent 70%)` |
| `HoverPulseGrid` | Dot grid + glowing orb | 12px grid lines + centered `animate-pulse` circle |
| `HoverGradient` | Directional corner gradient | `linear-gradient(135deg, ${color}0c 0%, transparent 60%)` |
| `HoverScene` | Full 3D wireframe | Lazy-loaded R3F scene filling the cell |

All tinted in the active agent's hue — they shift color as the agent cycles.

## Spec Readout Cells

Small instrument-readout cells:

```tsx
<div className="flex h-full flex-col items-center justify-center px-2 py-4">
  <span className="text-[7px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">BOOT</span>
  <span className="mt-1 text-[13px] font-medium tabular-nums text-[var(--ret-text-dim)]">~30s</span>
</div>
```

## Capability Chips

Agent-hue-tinted pills:

```tsx
<span
  className="inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-[var(--ret-text-muted)] transition-colors"
  style={{ borderColor: `${hue}33`, background: `${hue}08` }}
>
  <span className="h-1 w-1 rounded-full" style={{ background: hue }} />
  {cap}
</span>
```

## Corner Crosshair Marks

Used on banners, 3D viewports, spacers:

```tsx
<span className="pointer-events-none absolute left-1.5 top-1.5 h-1.5 w-1.5 border-l border-t border-[var(--ret-cross)] opacity-40" />
```

For larger viewport marks (2px borders, h-2 w-2), used on the 3D card.

## 3D Scenes (React Three Fiber)

- **HeroOrbitScene:** wireframe dodecahedron + torus rings center, 5 agent logos orbiting on a sphere
- **WireframeShapes:** per-cell mini wireframes (Dashboard, Loadout, Hosts, Environment)
- Canvas: DPR ≤ 1.5, antialias OFF (crisp 1px lines), `powerPreference: "low-power"`
- All geometry is `lineSegments` + `wireframeGeometry` + `lineBasicMaterial`
- No particles, no custom shaders, no solid meshes

## Animation Budget

| Technique | Use case |
|-----------|----------|
| React `useState` + `setTimeout` | Typewriter, brand mark cycle |
| CSS `@keyframes` | `ret-caret`, `ret-panel-in`, `ret-skeleton-shimmer`, `fleet-wire-travel` |
| Three.js `useFrame` | Continuous 3D rotation + camera lerp |
| CSS `transition-*` | Hover states (200–400ms) |
| `animate-pulse` | Status dots |

No GSAP. No Framer Motion. No scroll hijacking.

## Global FX

- **Grain:** `.ret-grain` — fixed SVG fractal noise, `mix-blend-mode: multiply` (light) / `screen` (dark), opacity 0.035/0.06
- **Wing backgrounds:** theme-aware PNG textures via `WingBackground` component
- **Nyx-lines texture:** `bg-nyx-lines.png` at `opacity-0 dark:opacity-20` inside decorative card cells

## Do NOT

- Use `border-dashed` for structural borders (all borders are solid hairlines; dashed only flanks headlines)
- Add padding to grid containers (cells fill edge-to-edge)
- Use `overflow-hidden` on hero wrapper (breaks full-bleed lines; use `overflow-x: clip`)
- Mix `style={{}}` with Tailwind for static values (style only for dynamic agent hue)
- Create cells without hover behavior (every cell gets a `hoverVisual` and an `action`)
- Use border-radius on outer grid structure (only inner cards get `rounded-lg`)
- Import animation libraries (budget is timers + CSS + useFrame)
- Use gradients/shadows on backgrounds (ground is flat token color + subtle grain)
