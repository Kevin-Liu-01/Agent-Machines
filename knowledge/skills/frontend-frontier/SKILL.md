---
name: frontend-frontier
description: Use when the user wants a high-signal frontend, distinctive art direction, strong motion design, 3D/parallax, shader effects, landing pages, docs sites, dashboards, or a tokenized design system that avoids generic AI-generated UI.
---

# Frontend Frontier

Use this skill when the job is not "make a page" but "make a page that actually has a point of view."

This skill is for:

- unique landing pages and marketing sites
- AI, devtools, and B2B SaaS frontends that need stronger taste
- animation systems, scroll choreography, parallax, 3D, shaders, and hero scenes
- design-system authoring, tokens, and consistency guardrails
- turning loose inspiration into implementation-ready direction

## Default stance

- Do not drift into generic SaaS chrome.
- Do not default to Inter, Roboto, shadcn, or arbitrary Tailwind soup unless the existing product already does.
- Pick one art-direction thesis, one motion thesis, and one depth thesis before writing UI.
- Build tokens before polishing components.
- Treat motion as a system, not garnish.
- CSS is substrate, not strategy. Use it for tokens, layout, fallbacks, and trivial states, not as the default animation architecture.
- Default to a frontier stack: Tailwind v4 `@theme`, Motion, GSAP, Lenis, React Three Fiber, shaders/WebGL/WebGPU, and React transitions where appropriate.
- Preserve performance, readability, and `prefers-reduced-motion`.
- Sweat the micro-details. Great UI usually comes from many tiny correct choices compounding.

## Workflow

1. Lock the art direction.

Read [references/aesthetic-systems.md](references/aesthetic-systems.md).

Choose one primary mode:

- editorial technical
- cinematic 3D
- architectural blueprint
- neo-brutalist
- experimental lab
- premium AI SaaS

Write a 3-5 line direction covering:

- visual thesis
- type pairing
- palette
- surface treatment
- motion grammar

2. Choose the methodology lens.

Read [references/design-methodology-atlas.md](references/design-methodology-atlas.md).

Pick:

- one discovery methodology
- one system methodology
- one evaluation methodology

3. Build the token system.

Read [references/design-system-and-tokens.md](references/design-system-and-tokens.md).

Define:

- color tokens
- spacing scale
- radii
- shadows
- border weights
- type scale
- z-index and blur tokens
- motion tokens

4. Choose the frontier runtime stack.

Read [references/frontier-stack-2026.md](references/frontier-stack-2026.md).

Default posture:

- Tailwind v4 `@theme` + runtime CSS variables for tokens
- Motion for component, layout, and gesture motion
- GSAP + ScrollTrigger for narrative choreography
- Lenis when scroll-linked motion needs synchronized scroll
- React Three Fiber + drei for real 3D scenes in React
- OGL or raw shader pipelines for shader-first microsites
- React `startTransition` / `useTransition` / `useEffectEvent` and experimental `<ViewTransition>` where useful

5. Choose the tactic families.

Read [references/frontend-tactics-atlas.md](references/frontend-tactics-atlas.md).

Pick the main tactic groups for the task:

- shell and navigation
- layout and density
- motion and scroll
- 3D or shaders
- forms and validation
- data display
- wait UX and resilience
- search and discovery
- AI interface patterns
- docs patterns

6. Route to specialized imported skills when useful.

Read [references/external-frontend-skill-map.md](references/external-frontend-skill-map.md).

Use it to choose focused implementation skills for:

- Motion / Framer
- GSAP / ScrollTrigger
- React Three Fiber / Three.js / Babylon / PlayCanvas
- Rive / Lottie
- PixiJS / A-Frame / Spline
- Blender / Substance pipelines

7. Decide the motion stack.

Read [references/motion-3d-playbook.md](references/motion-3d-playbook.md).

Bias toward the modern stack above and downgrade only when the problem is genuinely simple.

- Motion for component and layout animation
- GSAP + ScrollTrigger for timelines, scroll choreography, and orchestration
- Lenis for synchronized scroll when needed
- Three.js / React Three Fiber + drei for real 3D scenes
- OGL / shaders / WebGL / WebGPU when the surface itself is the concept
- Native scroll-driven animations and React / browser view transitions as progressive enhancement

8. Use references intentionally.

Read [references/source-index.md](references/source-index.md) to select:

- implementation references from official docs
- component references from galleries
- taste references from live sites

Do not cargo-cult a full site. Extract the useful pattern:

- nav treatment
- hero structure
- grid logic
- depth cues
- CTA shape
- motion rhythm

For basement-adjacent visual research, also read [references/design-research-basement-adjacent.md](references/design-research-basement-adjacent.md).

For design-engineering manuals, feedback systems, and quieter craft references, also read [references/design-engineering-ecosystem.md](references/design-engineering-ecosystem.md).

For newly emerging sources, registries, and agent-skill ecosystems worth monitoring, read [references/frontier-radar.md](references/frontier-radar.md).

For choosing between live-browser debugging and isolated automation, read [references/browser-debugging-workflow.md](references/browser-debugging-workflow.md).

9. If the user wants prompting help, use prompt recipes.

Read [references/prompt-recipes.md](references/prompt-recipes.md).

Use them for:

- agent prompts
- image/video generation prompts
- decomposition of screenshots into assets
- "give me 3 directions" exploration

10. Apply the micro-polish pass.

Read [references/interface-micro-polish.md](references/interface-micro-polish.md).

Check:

- heading and prose wrapping
- concentric radii on nested surfaces
- optical icon alignment
- numeric stability with tabular figures
- contextual icon transitions
- staggered enters and softer exits
- media outlines and shadow strategy

11. Run the trust and infra pass for backend-bound surfaces.

Read [references/infra-trust-checklist.md](references/infra-trust-checklist.md).

Check:

- Supabase Row Level Security where relevant
- auth flows including password reset
- rate limits on public or expensive endpoints
- server-side validation
- environment variable exposure
- CAPTCHA on public forms when abuse risk exists
- CORS restrictions
- safe error handling

## Non-negotiables

- One strong hero move beats ten moving things.
- If a page has 3D, the rest of the UI should usually get quieter.
- If typography is the star, reduce ornament and increase grid discipline.
- If a dashboard mock sits inside a marketing hero, it must obey the same token system.
- If motion hurts comprehension, cut it.
- If performance is unknown, profile before adding complexity.
- Do not recommend plain CSS as the primary motion system unless the interaction is truly trivial.
- Pick tactics intentionally. Do not cargo-cult patterns because they were trendy in one reference site.
- Final polish should include wrapping, radius consistency, optical alignment, and interruptible interactions.
- If the product touches auth, user data, or public forms, it is not done until the trust checklist is satisfied.
- For localhost and live browser debugging, prefer Chrome DevTools MCP over spawning a fresh Playwright browser unless determinism is the actual goal.

## Reference map

- Art direction: [references/aesthetic-systems.md](references/aesthetic-systems.md)
- Methodology atlas: [references/design-methodology-atlas.md](references/design-methodology-atlas.md)
- Frontier stack defaults: [references/frontier-stack-2026.md](references/frontier-stack-2026.md)
- Frontend tactics atlas: [references/frontend-tactics-atlas.md](references/frontend-tactics-atlas.md)
- Motion, 3D, shaders, performance: [references/motion-3d-playbook.md](references/motion-3d-playbook.md)
- Tokens, components, typography: [references/design-system-and-tokens.md](references/design-system-and-tokens.md)
- Deep black palette reference: [references/deep-black-variations.md](references/deep-black-variations.md)
- External implementation skill routing: [references/external-frontend-skill-map.md](references/external-frontend-skill-map.md)
- Micro-details and finishing passes: [references/interface-micro-polish.md](references/interface-micro-polish.md)
- Trust and infra checklist: [references/infra-trust-checklist.md](references/infra-trust-checklist.md)
- Prompting and design workflows: [references/prompt-recipes.md](references/prompt-recipes.md)
- Source list: [references/source-index.md](references/source-index.md)
- Basement-adjacent site study: [references/design-research-basement-adjacent.md](references/design-research-basement-adjacent.md)
- Design-engineering manuals and tool ecosystem: [references/design-engineering-ecosystem.md](references/design-engineering-ecosystem.md)
- Active watchlist and emerging sources: [references/frontier-radar.md](references/frontier-radar.md)
- Browser debugging workflow: [references/browser-debugging-workflow.md](references/browser-debugging-workflow.md)
