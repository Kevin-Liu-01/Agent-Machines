---
name: frontend-design-taste
description: Build distinctive frontends that avoid generic AI aesthetics. Provides anti-slop enforcement, variance dials, art direction archetypes, creative arsenal, and performance guardrails. Use when creating new landing pages, UI components, design systems, or when the user says "make it look good", "design direction", "avoid generic", "art direction", or "design taste."
---

# Frontend Design Taste — Anti-Slop Framework

> Adapted from [tasteskill.dev](https://www.tasteskill.dev/) and Kevin's design wiki.
> For Sigil projects, also read `.cursor/rules/taste-enforcement.mdc` which enforces these rules at the Cursor level.

## The Problem

LLMs default to the center of their training data: Inter font, generic card grids, blue accent, minimal animation, centered hero, blur blobs. The fix is not better prompting — it is providing a real design system with tokens, variance dials, explicit creative direction, and hard-banned patterns.

## Variance Dials

Three numbers drive all downstream decisions. Defaults shown below — adapt dynamically based on user requests.

```
DESIGN_VARIANCE:  8  (1=Perfect Symmetry, 10=Artsy Chaos)
MOTION_INTENSITY: 6  (1=Static, 10=Cinematic)
VISUAL_DENSITY:   4  (1=Art Gallery, 10=Cockpit)
```

### DESIGN_VARIANCE
- **1-3**: Flexbox `justify-center`, strict 12-column symmetrical grids, equal paddings.
- **4-7**: Overlapping margins (`-mt-8`), varied image aspect ratios, left-aligned headers over center-aligned data.
- **8-10**: Masonry, CSS Grid with fractional units (`2fr 1fr 1fr`), massive empty zones (`pl-[20vw]`).
- **MOBILE OVERRIDE**: Levels 4-10 MUST collapse to single-column (`w-full px-4 py-8`) below `md:`.

### MOTION_INTENSITY
- **1-3**: No automatic animations. CSS `:hover` and `:active` only.
- **4-7**: Fluid CSS transitions with `cubic-bezier(0.16, 1, 0.3, 1)`. Cascade `animation-delay` for load-ins. Only `transform` and `opacity`.
- **8-10**: Scroll-triggered reveals, parallax, spring physics via Motion hooks. Never `window.addEventListener('scroll')`.

### VISUAL_DENSITY
- **1-3**: Art gallery. Huge section gaps. Expensive and clean.
- **4-7**: Standard web app spacing.
- **8-10**: Cockpit. Tiny paddings. No card boxes; `border-t` / `divide-y` only. `font-mono` for all numbers.

## Before Generating UI

1. Read `~/Documents/GitHub/kevin-wiki/wiki/design/design-system.md` for current tokens
2. Read `~/Documents/GitHub/kevin-wiki/wiki/design/aesthetic-systems.md` for archetypes
3. Choose an archetype (see below) before writing any component code
4. Lock the six style variables
5. If in a Sigil project: read `.cursor/rules/taste-enforcement.mdc`

## Five Archetypes

### 1. Premium AI B2B
Mood: confident, expensive, quiet, precise. Palette: warm white or carbon base, one deep accent, one signal color. Type: strong sans + restrained display + mono for labels. Motion: subtle reveals, one morphing hero motif.

### 2. Editorial Devtool
Mood: intelligent, technical, fast, exact. Palette: paper or off-black, one electrical accent. Type: sharp grotesk + mono for labels. Motion: layout reveals, crossfades, cursor/figure markers.

### 3. Architectural Blueprint
Mood: schematic, conceptual, exacting. Palette: off-white, deep ink, cobalt/cyan. Type: precise sans + mono annotations. Motion: line draws, panel reveals, depth via layering.

### 4. Cinematic 3D
Mood: immersive, sculpted, atmospheric, slower. Palette: shadow-heavy neutrals, two light temps max. Motion: camera drift, pointer parallax, idle loops.

### 5. Neo-Brutalist / Experimental
Mood: blunt, memorable, anti-corporate, loud. Palette: black/white + one aggressive accent. Motion: abrupt, fast transitions, type movement, no syrupy easing.

## Style Variables to Lock First

| Variable | Options |
|----------|---------|
| Contrast level | low / medium / high |
| Depth level | flat / layered / scene-led |
| Type voice | engineered / editorial / luxurious / brutal |
| Surface finish | paper / glass / metal / grain / plastic / shader |
| Motion appetite | restrained / assertive / theatrical |
| Density | open / balanced / packed |

## Banned Patterns (Hard Failures)

### Visual & Layout
- Centered hero + blur blobs (when DESIGN_VARIANCE > 4)
- 3 equal cards in a row for feature sections
- `h-screen` (use `min-h-[100dvh]`)
- Flexbox percentage math — use CSS Grid
- Neon/outer glows via default box-shadow
- Pure `#000000` for backgrounds or text
- Oversaturated accents
- Gradients with no material logic
- Glassmorphism on white for no reason
- Fake 3D from stacking drop shadows
- Pill buttons everywhere with no hierarchy
- Custom mouse cursors (outdated, hurts a11y)
- Excessive gradient text on large headers

### Typography
- Inter / Roboto / Open Sans as primary typeface
- Serif fonts on dashboards or software UI
- Oversized H1s that scream instead of communicating hierarchy
- More than three font families

### Content
- Generic names: "John Doe", "Sarah Chan", "Acme Corp"
- Generic avatars: SVG egg icons, Lucide user placeholders
- Fake round numbers: `99.99%`, `50%`, `1234567`
- Startup slop: "Nexus", "SmartFlow", "SynergyAI"
- AI clichés: "Elevate", "Seamless", "Unleash", "Next-Gen", "Game-changer", "Delve"
- Lorem ipsum in visible UI
- Emojis in code, markup, headings, or alt text
- Unsplash links — use `picsum.photos/seed/{context}/W/H`
- Generic Lucide/Feather icons — use Phosphor (Bold/Fill) or Radix

## Required UI States

Every interactive component must implement:

| State | Rule |
|-------|------|
| Loading | Skeletal loaders matching layout dimensions |
| Empty | Composed empty state explaining how to populate |
| Error | Inline error reporting |
| Active/Pressed | `-translate-y-[1px]` or `scale-[0.98]` tactile feedback |
| Hover | Meaningful change, not just opacity |

## Design Engineering Directives

### Typography
- **Display/Headlines**: `text-4xl md:text-6xl tracking-tighter leading-none`. Use `Geist`, `Outfit`, `Cabinet Grotesk`, or `Satoshi` for premium vibes.
- **Body**: `text-base text-[var(--s-text-secondary)] leading-relaxed max-w-[65ch]`.
- **Color**: Never absolute `#000000`. Use off-black via token `var(--s-text)`. Secondary text via `var(--s-text-muted)`.

### Color
- Max 1 accent color. Saturation < 80%.
- Stick to one palette for the entire output. No warm/cool gray mix within a project.
- In Sigil: all colors via `var(--s-*)` tokens, OKLCH authored.

### Materiality & Shadows
- Cards ONLY when elevation communicates hierarchy. When shadow is used, tint it to background hue.
- For VISUAL_DENSITY > 7: cards banned. Use `border-t`, `divide-y`, or negative space.

### Forms
- Label above input. Helper text optional. Error text below. `gap-2` between input blocks.

## Creative Proactivity (Anti-Slop Implementation)

### Liquid Glass (when glassmorphism IS justified)
Beyond `backdrop-blur`: add `border-white/10` inner border + `shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]` for physical edge refraction.

### Magnetic Hover (MOTION_INTENSITY > 5)
Buttons pull toward cursor. NEVER use `useState`. Use Motion `useMotionValue` + `useTransform` outside the React render cycle.

### Perpetual Micro-Interactions (MOTION_INTENSITY > 5)
Breathing status dots, typewriter effects, float animations, shimmer, carousels. Spring physics always: `type: "spring", stiffness: 100, damping: 20`.

### Layout Transitions
Use Motion `layout` and `layoutId` for smooth reordering, resizing, shared element transitions.

### Staggered Orchestration
Never mount lists or grids instantly. `staggerChildren` (Motion) or CSS `animation-delay: calc(var(--index) * 80ms)`. Parent variants and children MUST be in the same Client Component tree.

## Creative Arsenal

Pull from these when building — never default to generic UI.

### Hero Variants
- Asymmetric: text left/right, background with stylistic fade
- Split screen 50/50
- Curtain reveal on scroll
- Text mask reveal (typography as window to video background)

### Navigation
- Mac OS Dock magnification
- Magnetic buttons
- Dynamic Island (pill that morphs for status)
- Mega menu reveal with stagger-fade
- Contextual radial menu at click coordinates

### Layout & Grids
- Bento Grid (asymmetric tiles)
- Masonry (staggered, no fixed row heights)
- Split screen scroll (halves sliding opposite on scroll)
- Horizontal scroll hijack

### Cards & Containers
- Parallax tilt card (3D tracking mouse)
- Spotlight border card (border illuminates under cursor)
- Holographic foil card (iridescent reflections on hover)
- Morphing modal (button expands into dialog)

### Scroll Animations
- Sticky scroll stack (cards stack over each other)
- Zoom parallax (background zooms with scroll)
- Scroll progress path (SVG draws as user scrolls)
- Locomotive scroll sequence (framerate tied to scrollbar)

### Typography Effects
- Kinetic marquee (text bands reverse on scroll)
- Text scramble effect (Matrix-style decode on load/hover)
- Circular text path (spinning)
- Gradient stroke animation

### Micro-Interactions
- Particle explosion button on success
- Skeleton shimmer loading
- Directional hover-aware button fill
- Ripple click effect
- Animated SVG line drawing
- Mesh gradient background

## Performance Guardrails

- **Hardware acceleration only.** Animate `transform` and `opacity`. Never `top`, `left`, `width`, `height`.
- **Grain/noise** on `fixed inset-0 pointer-events-none`, never scrolling containers.
- **Perpetual animations** isolated in `React.memo` `"use client"` leaf components.
- **`will-change: transform`** only on active animations, removed after.
- **Z-index**: systemic layers only (navbar, modal, overlay).
- **useEffect cleanup**: every animation effect returns a cleanup function.
- **Scroll**: `IntersectionObserver`, never `window.addEventListener('scroll')`.
- **Never mix GSAP/Three.js with Motion** in the same component tree. Motion for UI; GSAP/Three for isolated scroll sequences or canvas backgrounds.

## Dependency Verification

Before importing ANY library, check `package.json`. If missing, output the install command before providing code.

## RSC Safety

- Default to Server Components.
- Interactive UI extracted as `"use client"` leaf components.
- Check Tailwind version in `package.json` — don't use v4 syntax in v3.
- For v4: `@tailwindcss/postcss` or Vite plugin, never `tailwindcss` in `postcss.config.js`.

## Output Completeness

Every generation is production-critical. Banned:
- `// ...`, `// rest of code`, `// TODO`, `// implement here`
- "Let me know if you want me to continue", "for brevity"
- Skeletons when full implementation was requested

When approaching limits, write at full quality to a clean breakpoint:
```
[PAUSED — X of Y complete. Send "continue" to resume from: next section]
```

## Token Architecture (for Sigil projects)

Three layers: **primitive** (`color.gray.950`, `space.4`), **semantic** (`color.surface.page`, `motion.duration.fast`), **component** (only when needed: `button.primary.bg`).

Transport: Tailwind CSS v4 `@theme` + runtime CSS variables + OKLCH.

All visual properties MUST reference `var(--s-*)` tokens. Hardcoded hex, px, font names, shadow classes, and duration values are banned.

## Frontier Stack 2026

| Layer | Tool |
|-------|------|
| Tokens & styling | Tailwind CSS v4 `@theme`, OKLCH |
| Component motion | Motion (Framer Motion) |
| Scroll storytelling | GSAP + ScrollTrigger |
| 3D scenes | React Three Fiber + drei |
| Shader-first | OGL, custom GLSL/WGSL |
| App transitions | React `startTransition`, `<ViewTransition>` |

## Workflow

1. Choose archetype from the five above
2. Lock the six style variables
3. Set variance dials (or accept defaults: 8, 6, 4)
4. Define/verify tokens (primitive → semantic → component)
5. Provide: archetype name, token file, 2-3 reference URLs, explicit anti-patterns
6. Build components. The direction compounds.

## Pre-Flight Taste Check

- [ ] No banned visual patterns
- [ ] No generic names, numbers, or placeholder content
- [ ] No AI copywriting clichés
- [ ] Loading, empty, and error states implemented
- [ ] Spring physics for interactive animations
- [ ] Staggered reveals on lists and grids
- [ ] Interactive animations isolated in leaf components
- [ ] Mobile collapse for high-variance layouts
- [ ] No `h-screen` — only `min-h-[100dvh]`
- [ ] Token variables used throughout
- [ ] Dependency verification done
