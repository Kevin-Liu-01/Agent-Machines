# Interface design

The Worker is the product object. Visual hierarchy should help someone choose,
operate, and inspect it without learning the infrastructure vocabulary first.

## Reference and interpretation

The current dashboard/quickstart pass uses the supplied Ramp Router screenshots
for information hierarchy: focused steps, clearly grouped controls, quiet borders,
readable tables, and visible next actions. It does not copy Ramp branding,
credit offers, model data, or unimplemented routing strategies. Agent Machines
keeps its neutral palette, filled icons, official partner marks, and gear diagram.

Earlier diagram work draws on [Prototemplate](https://prototemplate.vercel.app/) and its
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
- Card titles: 18–20px; dashboard page titles: 30–36px.
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

### Landing-page baseline

The September 10 workspace redesign restores the deployed landing composition
from `f32edf4a077021996ffdbdde45e3d8734444d4ad`: original hero, clockwork
Worker diagram, sample fleet, product recordings, capability diagrams, SDK,
activity grid, navigation, and footer. These are separate from the dashboard.
Do not apply dashboard spacing or navigation choices to marketing components.

The corrected, executable SDK example, shared factual capability copy, and
animation lifecycle/accessibility fixes remain. A visual rollback must not
reintroduce broken sample code or discard hidden-tab/reduced-motion handling.
The Worker engine follows the user's September 11 mechanical-process references:
a compact, staggered cluster of five main gears. The Worker is largest;
four differently sized component wheels mesh directly with it. Four smaller,
lower-contrast sub-wheels nest in the gaps, including one short two-wheel train.
Every sub-wheel has three concentric inner rings with hub-to-rim connecting
spokes and recessed fasteners; keep the circles continuous and easy to read.
All nine rims use straight-sided trapezoidal teeth with broad flat crowns and
crisp corners. A 0.4-module addendum and 70–80% crown-to-base width make the
teeth shorter, chunkier, and visibly trapezoidal; their sides stay inside
the reference involute envelope. Keep circular bodies and the existing pitches,
phases, and speed ratios. This is a stylized visual, not a fabrication profile.
CSS wheels explicitly synchronize elapsed time to the core on mount and child
replacement. A child-list observer realigns streamed/HMR wheels without changing
the core angle, starting reduced-motion animations, or adding a frame loop.
Keep their machining details, exact mesh, and faster proportional rotation; do
not reconnect them into long arms or closed, mechanically locked loops.
Keep labels and logos stationary inside each main wheel,
move descriptions into the responsive legend, and preserve physical tooth-count
speed ratios, exact pitch contacts, and the shared pause/reduced-motion handling.
The prior local landing sources and tests were archived before restoration.
Newer standalone marketing components remain available in source but are not
mounted in the restored home page.

Supporting mechanical details stay small and static: bearing-framed walkthrough
icons, a desktop-only shaft connecting the four SDK setup steps, and one compact
two-gear cutaway beside the FAQ introduction. Reuse the engine's trapezoidal
teeth, but do not add background circuits, moving watermarks, or more animation
loops. Decorations are hidden from assistive technology and cannot intercept
input. Preserve all screenshots, code, copy controls, and factual caveats.

The sample fleet and activity history deliberately retain their earlier compact,
edge-to-edge instrument panels. Their current wording, filled icons, official
logos, and sample-data disclaimers remain, with 18px titles instead of oversized
section headings. Both headers use matching 20/32/40px responsive horizontal
insets and 24/32px vertical padding, independent of the compact content below.
Fleet cards use 6px gaps and equal columns. Activity uses joined
calendar/filter rows and an attached 240px day-detail column, stacking on mobile.
These are scoped exceptions, not a change to the rest of the landing-page rails.

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

## Loading, empty results, and recovery

- Every data-driven surface distinguishes loading, loaded content, no data,
  filtered-out content, and request failure. A failed request must never become
  a zero counter, an empty history, or an indefinitely spinning preview.
- App Router transitions have root and dashboard skeletons. Client panels use
  `DashboardLoadingState` with a visible status label and a layout-shaped
  placeholder (`cards`, `table`, or `editor`). The helper owns no page gutter;
  its shapes are decorative and respect reduced motion.
- Keep actions beside their result: reset filters beside an empty search,
  retry beside a failed read, and fleet/setup links beside a missing-machine
  prerequisite. A 404 includes a safe route back, without implying ownership
  of a missing resource. Do not provision anything on a retry of a read.
- Protect edits on save failure. Report save, export, install, and preview
  failures where the action happened; prevent duplicate mutations while busy.
- Page introductions should describe the outcome once. Put the concrete
  control or diagram next, with secondary explanations in named disclosures.
  Costs, credential requirements, unsupported operations, and sample-data
  provenance remain visible. Onboarding must not repeat its full introduction
  in both the dashboard header and the active step.
- Public catalog discovery follows the same state contract. Pricing inputs
  update illustrative estimates only, not live quotes. Blog and Contact show
  their actual available content and support paths, not placeholder activity.

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

- The custom desktop sidebar starts at 208px with visible labels and can collapse
  to a 72px icon rail. All destinations remain available
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
  option. Mobile navigation is a native disclosure with the current page label,
  all destinations in a two-column list, and a contained vertical scroll region.
  Route changes reset it closed; no sideways search through hidden tabs is needed.
- Both setup paths use larger labels, official runtime/provider logos, solid
  status icons, and grouped credentials. Comparisons and technical details are
  optional disclosures; billing, native-auth requirements, readiness, and
  credential-retention instructions remain visible.
- Guided onboarding moves focus directly to the next heading after a step
  change. An 80px scroll margin keeps it clear of the fixed toolbar. It does not
  steal focus on initial entry or animate the page scroll.
- A remembered setup step is not proof of a running Worker. Missing active
  machines get an explicit recovery state, not a success claim.

### Consolidated workspaces

Verification for this pass: 2,220 tests passed, 37 skipped across 205 files;
TypeScript passed and the production build generated 208 pages. Browser checks
covered Studio selection/memory navigation, Toolkit skill/MCP sections, the
empty workbench's file preview and creation form, schedule draft selection,
Insights' missing-storage recovery and embedded benchmarks, and Cmd-K search.
At a 400px CSS viewport the tested automation and benchmark pages stayed within
the viewport; the shared header remained 48px tall. No paid benchmark, machine
launch, schedule save, or user-data mutation was performed for these UI checks.
Local usage metrics still require configured Supabase storage. The UI must keep
that prerequisite explicit; a passing UI suite is not a live-provider SLA.

Six primary destinations replace the long feature rail:

| Workspace | In-page surfaces |
| --- | --- |
| Overview | Configuration checklist, compact runtime/compute launchpad, recorded fleet activity |
| Workspaces | Search/filter, table/cards, interactive empty workbench, real creation form |
| Studio | Agent setup library and templates; memory bundles |
| Toolkit | Registry discovery, saved skills, MCP servers, target-machine loadout |
| Automations | Editable schedule starters, machine schedules, fleet run history |
| Insights | Sampled usage/costs; provider benchmarks and routing evidence |

Quickstart and Settings remain secondary account destinations. Legacy memory,
skills, MCP, and benchmark URLs redirect to the owning workspace section.
Query-backed sections support refresh, browser history, and direct links.
Only the active section mounts its data panel. Catalog search/kind and preset
handoffs retain their existing validation; a preset opens the setup editor.

Machine navigation groups existing functionality into Overview, Workbench,
Tools & runtime, and Activity & files. Contextual links expose the console,
terminal, runtime, loadout, logs, sessions, and artifacts without duplicating
every surface in the main rail. Cmd-K still finds detailed features directly.

Page headings use 28/32px type with 20/24px top padding. Shared bodies use
16/20px vertical padding and 16px group gaps. Labels stay readable at 14px;
smaller text is supporting context, never the only explanation of an action.

Each empty workspace shows a relevant surface instead of a generic blank panel.
The workbench preview has keyboard-accessible terminal/files/activity tabs.
Studio's setup anatomy links to the corresponding editor/library.
Schedule starters only fill the existing editable draft after an explicit click;
saving, paid execution, and UTC constraints remain separate and visible.
Preview elements never manufacture files, run evidence, balances, or health.

### Workspace interaction contracts

- Dashboard headers and content share a 16px mobile / 24px desktop gutter.
  The content area is capped at 1440px; the fixed 48px toolbar stays one line.
- Overview progress derives from saved configuration and recorded installation
  outcomes, not an onboarding checkbox. Credential presence is not validation.
- Fleet defaults to a searchable, status-filtered table. Terminal and management
  links remain machine-scoped; card view and archived-machine actions remain
  available. Archiving is never presented as stopping billable compute.
- Quickstart is always re-enterable: Welcome → Connect → Configure → Workspace.
  Navigation does not save or provision. Final launch saves configuration and
  starts the existing idempotent operation; failed launch can leave saved settings
  or allocated compute. Successful completion offers the exact machine's Console
  link without an automatic redirect. Advanced setup stays available separately.
- Memory, skills, and MCPs are searchable libraries. Selection/saving does not
  imply installation, credentials, runtime support, or a verified live connection.
  MCP setup links preserve their search query and kind in Registry.
- Registry uses one search/source toolbar, icon-led type filters, and readable
  logo cards. Empty browse loads the bundled catalog; typed searches include
  external sources. Source status reports only queried sources, with partial
  failures and full failures distinct from an empty result. Saved filtering and
  sorting apply to returned results, not to an invented full-library inventory.
  URL discovery is explicitly a preview, validates HTTPS input, and resets the
  type filter without saving or executing anything. Installation requires a
  current, non-archived target and a reviewed command. Synchronous action locks
  prevent double submissions and filters hiding an in-progress installation.
  Save, remove, command completion, offline, manual-setup, and failure outcomes
  remain distinct; command success does not claim verified runtime availability.
  Library writes from separate cards are serialized because the save endpoints
  replace the account's library array. A failed write does not block later writes.
  GitHub previews accept repository roots, normalize `.git`/query/fragment
  suffixes, and explain why branch/file URLs are not supported.
- Benchmarks focuses on one metric across selected providers, with historical
  dataset selection and source labels beside every value: Measured, Demo,
  Reference, or Unavailable. Filters affect the comparison only, not paid-run
  scope. Missing values never become zero; unsupported capabilities remain
  distinct from undocumented ones. Run timestamps retain year and UTC, while
  historical pricing notes and citations stay available on small screens.
  Tables have contained keyboard-accessible horizontal scrolling. Paid runs
  require a resource/credit confirmation, with synchronous run/refresh guards;
  demo data stays explicitly synthetic. Unavailable routing insights never
  fabricate trace counts or success rates.
- Skill imports retain their draft after a failed or deferred install. Metadata
  saved to an account is not an installed skill file, and nothing is promised
  to install automatically when a machine wakes. Pending requests lock the form.
- Memory and saved-setup dialogs are labelled native modals. Escape dismisses
  and restores focus; pending writes prevent dismissal. Failed memory writes
  keep the form and its input available for retry.
- Schedules expose the existing create/edit/enable/run/delete controls for an
  explicitly selected machine. UTC and recurring charges are stated beside Save;
  Run now requires confirmation. Loading, failed requests, and an empty account
  are separate states, and run history remains inspectable.
- Console, terminal, logs, sessions, artifacts, and loadouts show a clear machine
  prerequisite instead of silently bouncing the user to another page. Polling
  views offer retry, avoid overlapping requests, and abort on route changes.
- Settings retains masked credentials, blank-to-keep behavior, confirmed removal,
  and SDK key controls. No secret values appear in marketing demos or screenshots.
  SDK key loading errors and sign-in requirements are separate from an absent key.
  Rotation and revocation require confirmation; unknown mutation outcomes require
  a status recheck. Copying reports completion or manual-copy guidance, and pending
  requests cannot be submitted twice.
- Usage and route outcomes distinguish missing deployment storage, unavailable
  requests, and genuinely empty results. Failed requests show setup guidance and
  retry, not empty charts or zero measurements; API errors remain sanitized and
  tenant-scoped.

## Motion receipt

| Owner / trigger | Purpose | Treatment | Keyboard / reduced motion |
| --- | --- | --- | --- |
| Buttons on press | Acknowledge input | CSS transform and exact color/opacity properties, 140–150ms | Immediate focus-visible feedback; no transform for reduced motion |
| Navigation and screenshot links on hover | Identify the target | Color or border-color, 150ms, stable hit area | Visible focus outline; no delayed navigation |
| Worker selection cards | Explain selection | Immediate selected state, small child-arrow translation on fine-pointer hover | State remains immediate; no hover movement under reduced motion |
| Architecture disclosure | Reveal supporting detail | Native details/summary; no animated height | Native keyboard activation; immediate final state |
| Capability category tabs | Browse one group of controls | Immediate selected panel; keep all 19 destinations | Roving tab stop, wrapping arrow keys, Home/End, linked tab/panel labels |
| Copy controls | Report the actual clipboard result | Immediate Copying, Copied, or actionable failure state; live announcement | Same behavior; no decorative transition between status messages |
| Clockwork engine | Explain how replaceable layers work together | Offset trains with broad, flat-tipped involute teeth, circular bearing rings, detailed fasteners, and four distinct idler constructions; tooth counts determine their angular speeds | Shared pause/resume, off-screen and hidden-tab pause, reduced-motion static view; HTML labels never rotate |
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
line. Runtime and sandbox use four idlers; models and tools use three. Each arm
has a distinct bend pattern and nonascending size order: a folded upper path,
a staggered lower path, a broad upper sweep, and a low return curve. A per-mesh
size/bearing specification replaces the shared three-idler template.
Pitch circles remain tangent; rotation reverses at every mesh. The initial
tooth/gap phase is derived independently from each pair's actual contact bearing.
Revolution periods scale with tooth count: smaller pinions turn faster than larger
wheels while their pitch-line speeds match. Each arm has its own machined idler
face: split spokes for runtime, box-section bridges for sandbox, triangular
trusses for models, and a slotted chuck for tools. Those faces and their keyed
axles rotate with each idler; the Worker and component labels remain stationary
and unclipped above the SVG artwork. Wheel bodies and stepped bearing rings stay
circular. Recessed hex sockets, chamfered nuts, washers, keyed axles, and rim
fasteners provide the angular machining details; the tools arm uses slotted drives.
The decorative SVG sits at 80% opacity; sibling HTML labels and logos retain
their original contrast. Connecting idlers add a separate 75% opacity layer
(60% effective opacity), keeping the core and four component wheels more prominent.
The 64-tooth core turns in 51.2 seconds; 12-, 18-, and 24-tooth idlers turn in
9.6, 14.4, and 19.2 seconds. The four 32-tooth component wheels turn in 25.6 seconds.
The two four-idler arms reverse their component wheels relative to the core;
the two three-idler arms retain the core's direction.
All rings share the same CSS animation epoch and play state. Small
screens pan within the diagram instead of shrinking its labels or changing
gear center distances. Flat tooth crowns use a shortened 0.8-module addendum,
making their lands wider without changing the involute equations, root profiles,
pitch geometry, or phase relationship. The minimum nominal contact ratio across
the rendered meshes is 1.1153; tip-to-root clearance is 2.8125 units. Decorative facework
stays within the root circle. This remains an illustration, not a manufacturing
specification.

## Verification boundaries

Check actual rendered output at desktop and narrow widths, not only class names.
Keep routing, setup guards, permissions, error states, and real action handlers
intact during visual edits. Local empty-fleet checks do not demonstrate production
provisioning, migrations, or backend latency. Do not create billable Workers for
a presentation-only regression check.

### September 10 dashboard and quickstart redesign

- The supplied Ramp screenshots informed the hierarchy and interaction density,
  not product claims, account balances, model data, or branding. The landing
  page now hands a real selected starter into the dashboard; the gear system,
  SDK example, provider distinctions, and component guide remain accessible.
- Desktop checks covered the overview, saved setups, machine fleet, settings,
  benchmarks, building blocks, memory, MCPs, Registry, schedules, and the
  machine-required console/terminal/log/session/artifact/loadout states. This
  local account had no machines: these checks are not live provider evidence.
- At 390px, the dashboard stays within the viewport, all navigation destinations
  are reachable from a vertical menu, search supports Cmd/Ctrl+K, and onboarding
  step changes focus their heading below the fixed toolbar. Desktop light-mode
  checks preserved visible text, controls, and official partner marks.
- Memory dialog cancellation restores focus; failure tests preserve input and
  reject malformed success responses. MCP search hands the exact query into
  Registry; a Playwright query rendered two matching entries rather than an
  unrelated fallback catalog. Skill-import retry retains unsaved instructions.
- Usage correctly reports the missing local Supabase metrics prerequisite and
  offers retry. No production database configuration, credentials, paid compute,
  model runs, or schedules were changed. API-key management still requires a
  real Clerk session; local development auth is not permission to mint SDK keys.
- Browser checks used existing UI and read-only DOM inspection. An extension-
  injected Grammarly attribute caused one Chrome development hydration warning;
  application hydration was not suppressed to hide it. OS-level reduced-motion
  emulation and live production/provider checks remain outside this pass.
- Final verification: 2,104 tests passed across 198 files, with 37 skipped.
  TypeScript and the production build passed, including all 206 generated pages.
  Twenty-one API-key component tests exercise auth, retries, reconciliation,
  confirmation, pending locks, token retention, and clipboard failures with
  mocked requests. No keys were minted, rotated, or revoked during verification.

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

### September 10 compact sample-panel restoration

- Restored the earlier fleet gutters and joined activity-panel composition,
  preserving all four sample cards, documentation links, current copy, logos,
  filled icons, and sample-data limitations. No shared card or dashboard styles
  were reverted. Existing motion was left unchanged; no animation was added.
- Browser checks at 320px, 375px, 768px, and the default 1280px width confirmed
  page-contained layouts. Desktop fleet cards share their top and bottom edges
  with 6px gaps; the activity detail column measures 240px. The mobile calendar
  retains its own horizontal scroll region and responds to keyboard arrows.
- Verified partner filtering, clearing the filter, and selecting a sample day
  with matching event details. Light and dark activity views retain visible
  labels and logos. The viewport and original system theme were restored.
- All 113 marketing, brand, and fleet tests passed across 16 files. TypeScript
  and the production build passed, generating 204 pages. These are local UI and
  mocked behavior checks; no Worker, credentials, or production state changed.

### Circular gear bodies and machined hardware follow-up

- All 17 wheel bodies are circular, with stepped bearing rings. Four distinct
  idler constructions retain split spokes, box-section bridges, triangular
  trusses, and slotted chucks. Keyed hubs, layered washers, chamfered nuts, and
  recessed fasteners add detail without adding animation owners or clipping labels.
- Geometry tests cover the shortened, flat tooth crowns at all five rendered
  tooth counts. Crowns are 37–71% wider than the full-addendum flat tips, with a
  minimum nominal contact ratio above 1.1. Root profiles, tangent pitch circles,
  tooth/gap phase, and speed ratios are preserved. No centers, counts, periods,
  or directions changed.
- Local 1280px checks covered both themes and readable, unclipped labels.
  At 375px, the 1000px canvas stayed in its 333px-wide panning region without
  widening the page; the right-arrow key panned it successfully. The viewport
  override was reset and the original system theme restored after verification.
- All 17 rendered gears ran at their five configured periods. Measured phase
  error across all 16 contacts stayed below 0.0001 radians (CSS matrix rounding).
  Keyboard pause held every transform unchanged, and resume restarted the train.
- All 125 marketing, brand, and fleet tests passed; TypeScript and the production
  build passed with 204 generated pages. Reduced-motion and visibility fallbacks
  retain their existing code/tests; no OS-level motion preference was emulated.
  No new motion loop, dependencies, Worker activity, or deployment was introduced.

### Varied arm layouts and quieter connecting gears

- Runtime and sandbox now use four idlers, while models and tools use three.
  All four size sequences and bend patterns differ; no consecutive meshes are
  collinear. The 19 wheels share the existing motion controller, with opposite
  rotation at all 18 contacts and tooth-count-based speed ratios.
- The original cropped involute profiles, module, and clearances are retained.
  Minimum unrelated tooth clearance is 19.33 units, caption clearance is 13.24
  units, and nominal contact ratio remains 1.1153. Label and logo styles are unchanged.
- The 14 connecting gears render at 60% effective opacity; core and component
  wheels stay at 80%. Local light/dark checks confirmed this hierarchy, and all
  19 transforms paused without changing before resuming. Measured mesh phase
  error stayed below 0.00001 radians, including CSS matrix rounding.
- At 375px, the 1000px canvas stays inside its 333px panning region; keyboard
  panning works without widening the page. The viewport override and theme
  were restored. Existing reduced-motion fallbacks remain covered by code/tests,
  not an OS-level preference change.
- All 127 marketing, brand, and fleet tests, TypeScript, and the production
  build passed; 204 pages generated. These checks were local and did not create
  Workers, modify credentials, or deploy changes.

### September 10 visual-library preservation

- Restored the original orbital hero artwork, all seven recorded screenshots,
  sample fleet, and filterable activity history. All six capability diagrams are
  visible without opening accordions. Current wording, compatibility limits,
  shared spacing, and dashboard/onboarding improvements remain intact.
- Removed the hero background grid and did not remount any circuit-board
  textures or ambient circuit art. The mechanical diagrams keep their own
  meaningful connections, logos, and gear details.
- Browser checks confirmed paused runtime/provider selection, matching selected
  logos, offscreen pause, seven successfully loaded screenshots, and no document
  overflow at the observed 390px and 1802px CSS widths. Temporary viewport
  settings were reset. Reduced-motion preference changes and listener/timer
  cleanup were tested with the actual component in a deterministic harness;
  an OS-level reduced-motion setting was not changed.
- Full web suite: 2,116 passed, 37 skipped across 199 files. TypeScript and the
  production build passed (206 generated pages). Local preview remains on port
  3210. No Worker, credentials, production data, commit, push, or deployment was
  changed by this presentation-only follow-up.
