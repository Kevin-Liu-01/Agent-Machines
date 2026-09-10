# Interface design

The Worker is the product object. Visual hierarchy should help someone choose,
operate, and inspect it without learning the infrastructure vocabulary first.

## Reference and interpretation

This pass draws on [Prototemplate](https://prototemplate.vercel.app/) and its
[brand deck](https://prototemplate.vercel.app/deck), particularly the type scale,
layer diagrams, and spacing. More importantly, it adopts a content-first structure:
show the code, the Worker configuration, the route, and the actual product before
explaining them. A paragraph is not a substitute for a useful visual or control.
Agent Machines retains its own brand marks, gears,
Reticle colors, and product vocabulary. The reference is inspiration, not a
source of product claims or implementation instructions.

## Type and layout

- Body copy: 16px with approximately 1.6 line height.
- Supporting interface text: 14px; dense metadata: 12–13px.
- Card titles: 18–20px; dashboard page titles: 30–32px.
- Marketing headings: 36–48px, with a deliberate smaller-screen scale.
- Use sentence case. Reserve monospace for code, commands, IDs, and measurements.
- Use space to group related controls. Borders separate groups, not every label.
- Let one concrete artifact lead each section: code, a diagram, a product view,
  or an actionable selection. Avoid repeating the same feature claim around it.
- Keep supporting explanations available through clearly named disclosures;
  never hide prerequisites, risky-action warnings, or whether a feature is planned.
- Keep diagrams readable as HTML text where scaling an SVG would make labels tiny.
- A routing diagram is an illustration, not a live provider-health indicator.
- Recorded product screenshots stay uncropped and open as full-size originals.
  Older captures are identified rather than presented as current capabilities.

### Shared landing-page rhythm

`lib/marketing/layout.ts` owns the landing-page rails: 20/32/40px responsive
insets, 40/56/64px section spacing, and equal desktop columns with a 40/48px
gap. Section headings use the same 30/44/48px scale. Diagrams, recorded product
views, supporting copy, SDK panels, sample activity, and FAQ answers follow
these rails; the existing hero keeps its instrument-frame composition.

“Build a Worker. Run a fleet.” uses six different visual relationships: recipe
assembly, a run/pause loop and journal, terminal-to-session/artifact output,
loadout-to-service connections, clients sharing a fleet view, and credential
and persistence boundaries. All labels remain HTML, with decorative SVG
connectors and official logos. Examples are explicitly marked as illustrations;
all 24 capability links and provider limitations remain visible.

The SDK example is highlighted by the TypeScript grammar on the server, using
the existing rehype highlighter. Tokens become escaped React text/span nodes,
not injected HTML. A scoped palette supports both themes. The displayed source
and clipboard payload share one constant; line numbers cannot enter selection.
Code and configuration panels share header/body/footer rows, without row gaps.
There is no browser-side syntax parser or syntax animation.

## Icons

`components/ui/icons.tsx` supplies genuine Phosphor filled icons. It imports each
SSR icon individually, without a context provider or a package-wide runtime
namespace. All interface consumers use this boundary. `Logo` and `ServiceIcon`
remain the source for official brand marks. Do not apply a global fill rule to
charts, gear outlines, logos, or other SVG artwork.

Search is the deliberate exception: `SearchOutline` uses a genuine hollow
magnifying glass for the search affordance. The normal `Search` export and the
rest of the interface remain filled; icon tests enforce this named boundary.

## Dashboard chrome and onboarding

- The custom desktop sidebar starts as a 72px icon rail and expands to 224px
  when labels or machine controls are needed. All destinations remain available
  in both modes, with accessible names and native hover labels on the rail.
- The sidebar header and dashboard toolbar share one fixed 48px height. The
  toolbar never wraps: long names truncate, secondary status and appearance
  controls live in an options disclosure, and search retains its icon and ⌘K.
- Keep destructive lifecycle warnings in a separate sticky band below the
  toolbar, not inside the options menu. A failed status refresh replaces stale
  health text and adds a visible warning icon to the options control, including
  on mobile. Compact layout must not conceal a risk to a Worker's files.
- All page and nested scroll regions use the global 2px scrollbar size, including
  horizontal code/diagram regions and portal-mounted panels. Chromium/WebKit use
  pixel sizing; Firefox retains its native thin fallback. xterm's separately
  rendered scrollbar reads the same token through its public overview-ruler
  option. Mobile navigation retains its intentional hidden scrollbar.
- Both setup paths use larger labels, official runtime/provider logos, solid
  status icons, and grouped credentials. Comparisons and technical details are
  optional disclosures; billing, native-auth requirements, readiness, and
  credential-retention instructions remain visible.
- Guided onboarding moves focus directly to the next heading after a step
  change. It does not steal focus on initial entry or animate the page scroll.
- A remembered setup step is not proof of a running Worker. Missing active
  machines get an explicit recovery state, not a success claim.

## Motion receipt

| Owner / trigger | Purpose | Treatment | Keyboard / reduced motion |
| --- | --- | --- | --- |
| Buttons on press | Acknowledge input | CSS transform and exact color/opacity properties, 140–150ms | Immediate focus-visible feedback; no transform for reduced motion |
| Navigation and screenshot links on hover | Identify the target | Color or border-color, 150ms, stable hit area | Visible focus outline; no delayed navigation |
| Worker selection cards | Explain selection | Immediate selected state, small child-arrow translation on fine-pointer hover | State remains immediate; no hover movement under reduced motion |
| Architecture disclosure | Reveal supporting detail | Native details/summary; no animated height | Native keyboard activation; immediate final state |
| Capability category tabs | Browse one group of controls | Immediate selected panel; keep all 19 destinations | Roving tab stop, wrapping arrow keys, Home/End, linked tab/panel labels |
| Copy controls | Report the actual clipboard result | Immediate Copying, Copied, or actionable failure state; live announcement | Same behavior; no decorative transition between status messages |
| Clockwork engine | Explain how replaceable layers work together | Offset trains of involute gears; varied wheel sizes determine their angular speeds, with spoked idlers making the ratios visible | Shared pause/resume, off-screen and hidden-tab pause, reduced-motion static view; HTML labels never rotate |
| Sidebar expansion | Reveal navigation labels and machine controls | Immediate 72px/224px layout change; no width tween | Native button, unchanged destinations, immediate focus state |
| Command search | Reach a page or machine | Immediate native modal; Cmd/Ctrl+K, no opening delay | Input autofocus, arrow navigation, deterministic Tab loop, Escape and focus restoration |
| Dashboard options | Reveal secondary status and appearance | Native disclosure, outside-click and Escape dismissal | Keyboard activation; Escape returns focus to its summary |
| Onboarding step change | Keep the next decision in view | Immediate heading focus and instant scroll, no initial-entry focus theft | Same behavior for keyboard and reduced motion; no timer |
| Landing capability links | Identify a diagram or related feature as a destination | Background/border-color feedback, 150ms; stable labels and geometry | Immediate focus outline; no transition for reduced motion |

The six capability diagrams are static illustrations: no blinking status,
simulated live output, or automatic step changes. This pass leaves the clockwork
engine's interlocking motion, pause controls, and reduced-motion fallback intact.

No scroll hijacking, route-entry curtains, delayed keyboard actions, or global
`transition: all`. Press transforms use the same CSS property as their transition
and reset; Tailwind's individual `scale` property must not be mixed with a
`transform`-only reset. Repeated presses remain interruptible.

The engine uses one scaled coordinate system and a common 6.25-unit module.
Each of its four branches follows an offset clockwork path rather than a straight
line. Pitch circles remain tangent; rotation reverses at every mesh. The initial
tooth/gap phase is derived independently from each pair's actual contact bearing.
Revolution periods scale with tooth count: smaller pinions turn faster than larger
wheels while their pitch-line speeds match. Curved spokes and axle details rotate
with each idler, while the Worker and component labels remain stationary.
The 64-tooth core turns in 51.2 seconds; 12-, 18-, and 24-tooth idlers turn in
9.6, 14.4, and 19.2 seconds. The four 32-tooth component wheels turn in 25.6 seconds.
All rings share the same CSS animation epoch and play state. Small
screens pan within the diagram instead of shrinking its labels or changing
gear center distances. The working flanks are involute profiles; root fillets
are illustrative, not a manufacturing specification.

## Verification boundaries

Check actual rendered output at desktop and narrow widths, not only class names.
Keep routing, setup guards, permissions, error states, and real action handlers
intact during visual edits. Local empty-fleet checks do not demonstrate production
provisioning, migrations, or backend latency. Do not create billable Workers for
a presentation-only regression check.

### September 9 verification

- Production compilation, TypeScript, and all 204 generated pages passed.
- 529 tests across dashboard, marketing, brand, and fleet passed.
- Browser checks covered 320px, 375px, and desktop layouts; the tested sections
  stay within the page while code and mobile navigation scroll in their own areas.
- Verified real copy success, keyboard disclosures, category selection and focus,
  runtime selection, and light/dark presentation. Provider creation was not invoked.
- Motion fallbacks are covered by implementation review; OS-level reduced-motion
  emulation was not part of this browser check. Checks were local, not production.

### Initial interlocking-engine verification

- Geometry tests cover all 16 contacts, common pitch, tooth/gap phase over
  multiple revolutions, contact ratio, clearance, and sampled involute profiles.
- All 17 rendered gear transforms were moving at their configured ratios; the
  measured phase residual was below 0.000005 radians (CSS matrix rounding).
- Keyboard pause froze every transform without phase resets; resume retained
  the train. Visibility and checkbox lifecycle behavior have component tests.
- 65 marketing/brand tests, TypeScript, and the production build passed during
  this follow-up. No provider or production state was changed.

### Clockwork-layout verification

- `/?engine=clockwork-ratios#worker-system` was checked locally at 375px,
  1280px, and 1440px. The 840-unit scene keeps the unscaled HTML captions clear
  of the gears and inside the horizontally pannable region on narrow screens.
- All 17 rendered rings use the five configured periods. Actual transform
  samples kept every contact's phase residual below 0.0001 radians, including
  after keyboard pause/resume (computed CSS matrices are rounded).
- Keyboard pause held every transform unchanged; resume preserved alignment.
  Keyboard panning works without horizontal overflow on the page. The
  transform-only CSS implementation retains its reduced-motion static fallback
  and shared off-screen/hidden-tab pause behavior.
- 69 marketing/brand tests and the production build, including TypeScript and
  all 204 generated pages, passed. This is a local presentation change only.

### Dashboard chrome and onboarding verification

- The custom rail measured 72px collapsed and 224px expanded. Both headers
  measured 48px in the browser; the toolbar stayed one line at 320px, 375px,
  and desktop widths. Sidebar scrollbars measured 4px in Chromium.
- Browser checks covered Cmd/Ctrl+K, immediate search focus, Tab/Shift+Tab
  containment, Escape focus restoration, and keyboard navigation to Memory.
  The options menu also dismisses with Escape and restores summary focus.
- Guided onboarding was checked through Agent, Preset, Provider, and Keys.
  Step changes focused the new heading near the top of the viewport. At 375px,
  neither onboarding path overflowed horizontally; setup fields remained 16px.
- The saved-setup recovery state was reproduced with no active machine and
  verified to return to agent selection without saving or provisioning.
  Missing, dangling, and archived active-machine records have regressions.
- The production build, TypeScript, and all 204 generated pages passed.
  All 659 tests across 64 dashboard, marketing, brand, onboarding, and fleet
  test files passed, including the sticky warning and stale-health regressions.
- These are local presentation and mocked behavior checks. No credentials were
  entered or saved, no Workers were launched, and nothing was deployed. OS-level
  reduced-motion emulation and production-auth layout were not exercised.

### Site-wide 2px scrollbar follow-up

- Browser measurements confirmed a 2px page gutter, 2px horizontal gutters in
  the mobile Worker-engine diagram and TypeScript example, and 2px sidebar and
  portal search scrollbars. Wheel, keyboard, and native scroll ownership remain
  unchanged; no scroll handlers or animations were added.
- Global CSS regressions cover both axes, browser fallbacks, and intentional
  hidden-scrollbar exceptions. The production build and TypeScript passed.
- The terminal's width is configured through the installed xterm API and covered
  by a source regression; no live Worker was started for this presentation change.

### Capability diagrams, syntax, and alignment verification

- Browser checks at 320px, 375px, 1024px, and 1440px confirmed the shared heading
  rails and page-contained layouts. All six diagrams kept readable labels without
  internal text overflow at the narrowest widths. Code and the activity calendar
  retained their own horizontal scroll regions; keyboard calendar panning worked.
- Checked the recipe, lifecycle, terminal/output, loadout, fleet, and credential
  diagrams visually. Light and dark themes preserved logos and diagram contrast.
  The paired recorded screenshots share edges and caption boundaries.
- Real rendered TypeScript tokens change colors with the theme. The copy control
  announced successful copying; tests preserve exact source text, escaping, and
  non-selectable line numbers. Both SDK panels measured 708px high at 1440px,
  with matching header/footer boundaries and no accidental vertical grid gaps.
- All 688 selected dashboard, marketing, brand, onboarding, and fleet tests pass;
  the final marketing/brand-only rerun passed 99 tests. TypeScript and the
  production build passed, generating all 204 pages. An initial external Google
  Fonts download failure cleared on retry without a font or configuration change.
- The highlighter now explicitly declares its already-locked `vfile@6.0.3`
  dependency and uses its actual typed file object. No client parser was added.
- Preview screenshots are saved outside the repository. The temporary viewport
  override was reset and the original system-theme preference restored. This
  pass changed presentation only: no Worker, credentials, or production state
  was modified, and nothing was committed or deployed. Reduced-motion fallbacks
  were reviewed in code, not through an OS-level motion preference change.
