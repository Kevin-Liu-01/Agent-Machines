# Agent Activity Log

> Persistent memory for AI agents working on this project. Agents must read this
> file at session start and append after every meaningful change.

## Convention

- **Read first.** Before making changes, read this file to understand project history.
- **Append after changes.** Log decisions, state transitions, and open threads.
- **Never delete.** This file is append-only.
- **Skip noise.** Don't log formatting fixes, import reordering, or trivial typos.

---

## Demo video script (3 min) — control plane edition

**ICP on camera:** Founder / PM / ops lead who uses AI daily but does not live in a terminal.  
**Technical audience (subtext):** Engineers who've tried raw Docker + Claude Code and felt the gap.  
**Run:** `cd web && pnpm dev` → http://localhost:3210 (Clerk + real provider credentials)

**One-line thesis:** ChatGPT is a session. This is a **machine** — persistent, observable, schedulable, and yours.

---

### Full script (read on camera)

```
[0:00 - 0:15] Cold open — the primitive, not the chatbot.
Screen: agent-machines.dev/dashboard/setup.
"No preamble. Most AI products give you a chat window. We give you a computer
that stays on — with an agent already installed, already wired to your tools."

Pick template: Full-stack dev agent. Substrate: E2B, Sprites, or Dedalus (same harness). Click Provision.
Timer ~30s. Gateway comes online.

"One click. You didn't rent a GPU. You didn't SSH into a box. You got a
persistent agent machine: 161 skills, 30 MCP servers, browser automation,
cron, and a live gateway — deployed on infrastructure that survives when
you close the tab."

[WHY THIS IS OP — plain English]
"Chat resets. Context evaporates. Cron jobs can't run in a browser tab.
Your company's procedures live in Notion, not in the model. A persistent
agent-container fixes all of that: disk, process, schedule, identity —
one unit you can wake, sleep, and audit."

[TECHNICAL CHALLENGE — 10 seconds, for engineers in the room]
"The hard part isn't the LLM. It's the control plane: bootstrapping Hermes
or OpenClaw on arbitrary substrates, keeping gateway auth out of the model
path, reconciling sleep/wake without losing /home/machine, and streaming
every tool call back to a dashboard humans can trust. We built that layer first."

[0:15 - 0:40] Observation — the control plane is the product.
/dashboard → Activity heatmap (week view). Tap a day. Sidebar shows events.
/dashboard/chat on full-stack-dev. Click Bootstrap agent once if cold.

"Run a security audit on this repo."

Split screen energy: chat on the left, dashboard on the right.
Show live: skill loaded (deepsec), browser open, terminal exec, file read,
tokens and cost ticking.

"This is not a black box. Non-technical users get a flight recorder —
what happened, when, how much it cost. Engineers get the harness we used
to benchmark agents across Dedalus, E2B, and Sprites. Observation isn't
a nice-to-have. It's how you trust agents with real work."

[0:40 - 1:00] Compounding — procedures become assets.
Audit finishes. Chat: "Save this audit pattern as a skill."
Show SKILL.md on disk. Cut to /dashboard/skills — library at 161.

"Every complex task becomes a reusable procedure on the machine — not
trapped in chat history. After six months you have hundreds of custom
skills on /home/machine. You can't export that to ChatGPT. That's intentional."

[1:00 - 1:20] Insertion layers — your stack, not ours.
/dashboard/loadout — 161 skills, MCP catalog, tool surface.
/dashboard/mcps — Vercel, Stripe, Supabase, Datadog cards.
Optional: /dashboard/registry → add a skill URL.

"161 skills out of the box — but everything is an insertion point.
Your skills. Your MCP services. Your governance. The control plane doesn't
care which agent runtime or substrate you pick; it wires the same observability
and loadout either way."

[1:20 - 1:45] Cron — agents that work while you sleep.
/dashboard/cron — four schedules.
Open nightly-memory-consolidation (0 3 * * *). Show execution trail:
machine woke at 3:12am, health check, log tail, MEMORY.md diff. Cost: $0.04.

"Nobody prompted this. The control plane woke the machine, ran the job,
wrote the artifact, and put it back to sleep. That's the difference between
'AI assistant' and 'AI employee.'"

[1:45 - 2:10] Fleet — specialized agents, one pane of glass.
/dashboard — fleet strip: full-stack-dev (active), code-review, research, ops.
Set active on code-review. Show machine-scoped chat history and loadout differ.

"Nobody wants one agent that does everything. You want a code-review agent
on GitHub + Linear, a research agent with browser + search, an ops agent
on Vercel + Datadog. The dashboard is the control plane for the fleet.
Dedalus vs E2B vs Sprites is an implementation detail you swap without
rebuilding your procedures."

[2:10 - 2:35] Endgame — agents provisioning agents.
/dashboard/terminal or fleet → Spin up new machine.
Narrate (live or staged): head agent requests code-review + staging deploy
machines; dashboard shows provisioning → running; code-review processes PR;
deploy picks up on pass; both sleep.

"This is where it goes. An MCP surface so agents provision and coordinate
other agents. The platform becomes self-scaling — agents create demand for
more agents. The control plane is the moat, not any single model."

[2:35 - 3:00] Pull back — the full instrument panel.
/dashboard: Activity heatmap, fleet metrics, gateway latency, Telemetry charts,
quick links. All four machines visible.

"OpenRouter for agents and containers. Persistent workers, supervised fleet. Humans today. Agents tomorrow.
161 skills. 30 MCP servers. Any substrate. Full observability.
For humans today — founders, operators, engineers who need trust, not magic.
For agents tomorrow — the coordination layer they run on.

agent-machines.dev."
```

---

### Rehearsal click path

| Time | URL | Action |
|------|-----|--------|
| 0:00 | `/dashboard/setup` | Walk Provision — any substrate (E2B / Sprites / Dedalus) |
| 0:15 | `/dashboard` | Activity heatmap → tap a hot day → show sidebar events |
| 0:20 | `/dashboard/chat` | Bootstrap once if needed → security audit thread or live prompt |
| 0:40 | `/dashboard/chat` → `/dashboard/skills` | Save-skill thread; show 161 count |
| 1:00 | `/dashboard/loadout`, `/dashboard/mcps` | Harness + Datadog card |
| 1:20 | `/dashboard/cron` | Open `nightly-memory-consolidation` drill-down |
| 1:45 | `/dashboard` | Fleet strip; Set active → code-review |
| 2:10 | `/dashboard/terminal` or **+ Spin up new machine** | Provision narrative |
| 2:35 | `/dashboard` | Telemetry section + activity + metrics strip |

### Beat verification (2026-05-21)

| Beat | Status | Notes |
|------|--------|-------|
| Provision + primitive story | ✅ | Setup wizard, ~30s boot copy |
| Activity / control plane | ✅ | `ActivityOverviewPanel`, time-range filters |
| Security audit + observation | ✅ | Chat stream; Bootstrap once on cold load |
| Save skill | ⚠️ | Stream OK; align chat count vs 161 UI |
| Loadout / MCPs | ✅ | 161 skills, 30 MCP servers |
| Cron 3am story | ✅ | 4 crons, drill-down in demo-config |
| Fleet (4 machines) | ✅ | full-stack-dev, code-review, research, ops |
| Terminal / provision | ⚠️ | Manual spin-up; script narrates endgame |
| Telemetry pullback | ✅ | `FleetMetrics`, `ObservabilityPanel`, `MetricsChartPanel` |

### Canonical demo numbers (use on camera)

| Claim | Source |
|-------|--------|
| 161 skills | Skills page, loadout, overview harness |
| 30 MCP servers / 244 tools | MCP page, loadout |
| 4 crons | Cron panel |
| 4 demo machines | demo-config fleet |
| 17 MCP **services** | Marketing shorthand only — prefer "30 MCP servers" on camera |

---

## [2026-05-21 05:06] config | Saved 3-min demo script + walkthrough map

**Changed:** `memory.md` (created), demo client-bundle fix (`demo-types.ts`, `demo-fleet-persist.ts`, `machine-narratives.ts`, `session-store.ts`, `state.ts`, `clerk.ts`, `handlers.ts`, `runtime.ts`)
**Why:** User asked to remember demo script and verify runnable demo on :3210
**Decision:** Split cookie persistence out of `state.ts` so `ChatShell` → starter-prompts does not pull `next/headers` into client bundle
**Open:** Bootstrap click on cold chat load; align skill counts in chat copy vs UI

## [2026-05-21] feat | Activity overview, fleet cards, demo control-plane pass

**Changed:** Activity heatmap panel, fleet machine cards, overview telemetry restore, demo persistence split, starter-prompts client module
**Why:** Dashboard revamp + runnable demo for YC recording
**Decision:** Server returns raw activity days; client builds grid with week/month/all scales
**Open:** Auto-bootstrap polish; keep harness counts registry-derived (161 skills as of last sync)

## [2026-05-29] feat | Substrate benchmark harness + dashboard

**Changed:** New `web/lib/benchmarks/*` engine (types, metric catalog in `constants.ts`, `stats`, `Probe` base + exec/cpu/disk probes, `engine` lifecycle runner + parallel suite, `store`, `format`, `credentials`, `FakeProvider`, `demo` synthesizer). CLI `web/scripts/run-benchmarks.ts` wired as root `npm run benchmark` (tsx --tsconfig web/tsconfig.json). API `GET /api/dashboard/benchmarks` + guarded `POST .../run` (demo|live). UI `/dashboard/benchmarks` (`BenchmarksClient` + `benchmarks/*` components: leaderboard, comparison bars, score ranking, capability/pricing matrix, methodology) wired into `SidebarNav`. Cited seed `web/data/benchmarks.json`; Supabase migration `003_provider_benchmarks.sql`. View model `web/lib/dashboard/benchmarks-view.ts`. Tests: 27 (stats/probes/engine/view).
**Why:** User asked for scripts + UI to show targeted benchmarks across all substrate providers (the README's "Dedalus benchmarks best on boot" claim, made empirical + comparable).
**Metrics measured (via `MachineProvider`):** cold boot→first exec, provision, time-to-ready, resume/wake, exec p50/p95, CPU Mops/s, disk write/read MB/s, teardown, reliability%; composite responsiveness score = geomean of scored latencies normalized so fastest = 100.
**Decisions:**
- Built on the existing `MachineProvider` contract so all 4 providers compare apples-to-apples; probes are a `Probe` base class others extend.
- Honest data sourcing: seed carries cited reference/capability/pricing (basis tag: published|estimate|unknown), `source: "reference"`; real runs tag `measured`; demo synthesizer tags `demo`. UI never presents reference/demo as measured. Dedalus pricing left `unknown` (cost.ts internal estimate is ~300x off public peers).
- `--demo` / Demo-data button synthesize deterministic ordered numbers from `DEMO_PROFILES` (FakeProvider wall-clock is JS/poll noise, unsuitable for ordering); engine tests are structural, ordering covered by `computeResponsivenessScores` + demo.
- Client applies POST run optimistically (`applyRunToSnapshot`) so the feature works even before migration 003 is applied.
- Live runs require `--yes` (CLI) / confirm() (UI); they provision+destroy real machines and spend credits. CLI is the recommended path for full suites (API route has 300s cap).
**Open:** Apply migration 003 for persistence; run a real `npm run benchmark -- --yes` to replace reference numbers with measured; optional landing-page section reusing `BenchmarkComparisonBars`.

## [2026-05-29] feat | First live benchmark run + honesty fixes

**Ran:** `npm run benchmark -- --yes` — only `DEDALUS_API_KEY` is in env, so E2B/Sprites/Vercel were skipped (no creds). Real measured Dedalus (2vCPU/4GiB/10GiB, 12 iters): cold boot→first exec **13.2s**, provision **3.17s**, time-to-ready **11.6s**, resume **4.25s**, exec p50 **1.56s** / p95 1.59s, CPU **14.9 Mops/s**, disk write **120 MB/s**, disk read 8.1 GB/s (page cache — read-back is warm), teardown **757ms**, reliability 100%.
**Finding:** The public-API end-to-end latency is seconds, NOT the README's "~250ms boot" — the 1.5s exec floor is our Dedalus client's 1s completion-poll (`POLL_INTERVAL_MS` in `web/lib/providers/dedalus.ts`). The harness made that empirical. (Future: a streaming/no-poll exec path would lower exec latency.)
**Changed (to surface the run without the unapplied migration):**
- `store.ts`: added `writeLocalRun` / `readLocalRuns`; `getSnapshot` now merges Supabase runs + local `<web>/.benchmarks/*.json` files, dedupes by runId, falls back to seed. CLI always caches the run to `<web>/.benchmarks/` (gitignored `.benchmarks`). Closes the loop fully offline.
- `benchmarks-view.ts` `pickWinner`: once any measured/demo cell exists for a metric, rank ONLY among measured — a cited reference (e.g. E2B 150ms) must never outrank a real measurement (Dedalus 13.2s). Added `source` to `LeaderboardEntry`; winner cards show a `ref`/`demo` tag. Locked with a regression test (`measured-beats-reference`).
**State:** Supabase still lacks table 003 (service-role key can't run DDL; no DB password/`config.toml` in env, so I couldn't apply it). Dashboard reads the local run file and shows measured Dedalus + reference for the rest. Tests: 73 pass.

## [2026-05-29] data | First full 4-provider measured run

**Setup:** Sprites token + E2B key provided by user (passed inline, not persisted). Vercel via OIDC: `vercel link --yes` (linked `kl01s-projects/web`) + `vercel env pull web/.env.vercel.local` → `VERCEL_OIDC_TOKEN` (expires ~12h; `.env*.local` now gitignored). Provider reads OIDC via `hasOidcCredentials()`; SDK auto-uses the env token.
**Run 9bce2873 (2vCPU/4GiB/10GiB, 12 iters), measured:**
| metric | dedalus | sprites | e2b | vercel |
|---|---|---|---|---|
| cold boot→first exec | 4.91s | 6.09s | 1.55s | **1.12s** |
| provision API | 3.24s | **613ms** | 860ms | 673ms |
| time to ready | 3.39s | **660ms** | 981ms | 843ms |
| resume from sleep | — (err) | 5.25s | **472ms** | 2.02s |
| exec p50 | 1.57s | 5.34s | **230ms** | 290ms |
| CPU Mops/s | 28.4 | 9.3 | **40.4** | 22.0 |
| disk write MB/s | 121 | 214 | **1000** | 908 |
| disk read MB/s | **9500** | 2300 | 5500 | 6300 |
| teardown | 790ms | 285ms | 341ms | **145ms** |
| score | 22 | 23 | 92 | **100** |
**Findings:**
- **Vercel** wins responsiveness (100), **E2B** close (92); both have direct/fast exec (230–290ms p50). **Dedalus** (22) and **Sprites** (23) are dragged down by adapter exec overhead: Dedalus's 1s completion-poll floor (~1.57s p50) and Sprites creating a fresh `@fly/sprites` WS client per exec (~5.3s p50). These are *adapter* costs, not raw substrate speed — optimizing those adapters (persistent WS / streaming exec) would change the ranking.
- **Dedalus resume = error**: `wake()` throws when the machine is still `running` (HMAC-gated sleep didn't park it within the 8s window) → wakeMs null, reliability 90%. Honest. Dedalus cold boot also varied run-to-run (13.2s → 4.9s) = placement variance.
- **Sprites** has the fastest provision/ready (~0.6s) + good disk write; **E2B** best CPU + disk write; **Dedalus** best (cached) disk read.
**Open:** Persist to Supabase (migration 003); consider a persistent-WS Sprites exec + non-poll Dedalus exec to measure raw (not adapter) latency; `.env.vercel.local` OIDC expires in ~12h (re-pull to re-run Vercel).

## [2026-05-29] perf/feat | Migration 003 live, exec adapters optimized, Vercel logo fixed

**Migration 003 applied by user** → benchmark runs now persist. Re-run stored 4 rows to Supabase (run `107d48db`); dashboard `getSnapshot` reads Supabase first, merges local `.benchmarks/` files, falls back to seed.
**Optimizations (production provider code, benefits whole app):**
- `dedalus.ts` exec: replaced fixed `POLL_INTERVAL_MS=1000` with adaptive backoff (`60ms → ×1.6 → 1000ms` cap). Measured exec p50 **1.57s → 866ms** (~45% faster). Helps dashboard terminal + metrics collection too.
- `sprites.ts` exec: memoized the dynamic `import("@fly/sprites")` + cache one `SpritesClient` + per-name `Sprite` handle on the instance (per "reuse clients" rule). NOTE: exec p50 stayed ~5.4s — the `@fly/sprites` `exec`/`execFile`/`spawn` open a fresh WebSocket per command (`SpriteCommand`), so latency is WS-connect-bound, not import/client overhead. Real gains need a persistent tmux session (`createSession`/`attachSession`) — bigger change, deferred.
**Vercel logo (proper, across dashboard):** `Logo.tsx` `DEFAULT_TONE.vercel` `native → currentColor` so the monochrome triangle adapts to theme (was a fixed black, invisible in dark mode). Unified benchmarks `ProviderMark` and `ProviderRouteBanner` onto `Logo` (which has marks for all 4 substrates) instead of `ServiceIcon tone="color"`. Verified: Vercel triangle now renders white in dark mode.
**Re-run 107d48db (optimized):** dedalus exec 866ms (was 1.57s); scores E2B 100 / Vercel 52 / Dedalus 17 / Sprites 17 (E2B+Vercel win on fast direct exec; Dedalus/Sprites dragged by lifecycle + Sprites WS exec).
**Note:** User is mid-refactor on `DeployAndTalk.tsx` / `upstreams.ts` / `RouterSelect.tsx` (uncommitted, 5 typecheck errors there) — left untouched; my files are type-clean, 39 provider+benchmark tests pass.

## [2026-05-29] feat/docs | Browser Agent Console — product insight captured

**What shipped:** Interactive live console on `/dashboard/machines/[id]/terminal` — real agent CLIs (Codex, Claude Code, Hermes, OpenClaw) in xterm.js over tmux-over-exec + SSE. Deploy & Talk → bootstrap → `?launch=1` auto-starts the CLI. Exec-first (no mandatory Cloudflare tunnel for console).

**Why it matters:** Best agent tools are CLIs; most users never touch a terminal. We built CLI-as-a-service: substrate-agnostic, serverless-safe (session on box, stateless Vercel control plane), neutral routing across E2B/Sprites/Vercel/Dedalus.

**Docs written:**
- `knowledge/BROWSER-AGENT-CONSOLE.md` — full insight, architecture diagram, positioning copy, honest limits
- `web/docs/sandbox-terminal-gateway.md` — updated (interactive tier no longer "future"; links to knowledge doc)
- `knowledge/MEMORY.md` — product blurb added

**Positioning one-liner:** "We put Claude Code / Codex / Hermes / OpenClaw in a tab."

**Broader frame (May 2026):** Almost no browser terminals on serverless. Inversion = tmux on box + HTTP/SSE courier. Explainers: `knowledge/AGENT-MACHINES-EXPLAINER.md` (3 para, whole product), `knowledge/BROWSER-AGENT-CONSOLE-EXPLAINER.md` (4 para, terminal).

## [2026-07-27] design/seo | OpenGraph + README routing redesign

**Changed:** Rebuilt `web/app/opengraph-image.tsx` and `web/public/brand/agent-machines-readme.svg` as a minimal mark + headline + description + routing diagram. Both use the project's real Nacelle Regular/SemiBold font data; the README uses the full banner; the Twitter image URL is versioned; and `Twitterbot` has an explicit robots group for `/opengraph-image`, `/api/og`, and `/api/og-home`.
**Finding:** A live Twitterbot fetch returned 200 for both the homepage and `/opengraph-image`, with complete OG/Twitter metadata. The generic robots rule already allowed `/opengraph-image`, so the observed preview miss was more consistent with social-card caching than crawler denial. Keep the explicit rule as durable defense and bump the Twitter image query when artwork changes.
**Verification:** Final 1200 x 630 OG and 1600 x 720 README renders inspected; SVG parsed; TypeScript passed; production Next build completed; production-mode Twitterbot fetch returned PNG 200 and the expected robots group.

## [2026-07-27] feat/ui | GSAP + Lenis motion system

**Changed:** Added a single root `MotionProvider` that synchronizes Lenis with the GSAP ticker, animates internal route changes through a three-panel brand curtain, reveals route content and reticle sections with GSAP/ScrollTrigger, and renders a scroll-progress hairline. Home, marketing, and dashboard shells expose stable motion boundaries instead of embedding route logic in each page.
**Decisions:** Respect `prefers-reduced-motion`; keep touch scrolling native; bypass Lenis for terminals, dialogs, and any nested scroll container; intercept only unmodified same-origin route clicks; let same-page anchors, downloads, external links, and new tabs retain native behavior.
**Verification:** Desktop and 390px mobile renders inspected in the app browser; route cover/reveal, scroll reset, section entrances, Lenis progress, nested-scroll escape logic, and zero horizontal overflow checked. TypeScript and production build pass.

## [2026-07-27] design/system | Icon sourcing and rendering policy

**Decision:** Use [theSVG](https://thesvg.org) for third-party identity marks and real provider-specific architecture resources; use Lucide for generic product actions/status/metadata; keep custom SVG only when the geometry itself communicates Agent Machines topology or data. Do not substitute a cloud-vendor architecture icon for a provider-neutral concept.
**Implementation:** Vendored theSVG's Claude Code, Codex, and Cursor assets under `web/public/brand/thesvg/`, with slug/variant/license provenance in `manifest.json` and a repeatable `pnpm sync-icons` command. `Logo.tsx` is still the single runtime-mark renderer. Consolidated tool categories, fleet metadata, theme controls, workflow steps, gateway labels, disclosure arrows, statuses, file actions, and loadout kinds onto Lucide.
**Guardrail:** Library entries are candidates, not automatic upgrades. The current official OpenClaw mark is better than theSVG's generic lobster and stays in place. Agent Machines, Dedalus, E2B, and Sprites also keep their local official/custom assets because theSVG does not have suitable replacements.
**Verification:** TypeScript passes. Homepage and onboarding inspected in light and dark themes; Claude Code, Codex, and Cursor remain legible at 12–20px; all observed brand images loaded with nonzero dimensions; no browser console errors.

## [2026-07-27] design/system | Diagram geometry and circuit language

**Decision:** Product diagrams use a shared 45-degree construction system: horizontal/vertical spines are allowed, but branches, fan-ins, and direction changes resolve through aligned diagonals instead of orthogonal elbows. Junctions are diamonds, modules use clipped corners, and strokes stay square/mitered rather than rounded.
**Tokens:** Use current Reticle neutrals (`--ret-bg`, `--ret-border-hover`, `--ret-purple`) in UI diagrams. Exported light artwork uses `#FBFBFB`, `#18181B`, `#52525B`, `#71717A`, and the actual mark accent `#9B98A8`; dark panels use `#09090B` / `#A1A1AA`. Nacelle remains the diagram typeface: 400 for descriptions and values, 600 only for labels and headings.
**Scope:** The rule is applied to the shared geometric schematics, repeating circuit texture, homepage dual-route graphic, architecture graph, README banner, and OpenGraph route. New diagrams should reuse these axes and weights instead of introducing ad hoc 90-degree circuit traces.

## [2026-07-31] feat/mux | Harness x sandbox multiplexer (src/mux)

**Changed:** Added `src/mux/`, a direct-to-substrate multiplexer over two orthogonal planes. Substrate plane: `SandboxProvider` adapters for e2b, sprites, vercel, dedalus normalizing create/connect/exec/stream/PTY/files/publicUrl/sleep/wake/destroy, each declaring capabilities (`pty: native | tmux | none`, persistence model, reattach) instead of pretending to be identical. Harness plane: `HarnessAdapter` recipes for claude-code, codex, openclaw, hermes normalizing install, auth injection and a `parseLine` normalizer into one `MuxAgentEvent` union. `createMux()` composes them: primary -> backups, uncredentialed lanes skipped up front, transient placement errors failed over, every decision recorded in `machine.attempts`. Surfaces: SDK export, `am mux` CLI (run/shell/term/ls/routes/rm), `scripts/mux-live-test.ts`.

**Decision — failover is placement-time only.** Runs are never replayed onto another substrate mid-flight, so there is no idempotency hazard. `missing_credentials` and `not_supported` do not retry (they fail the same way everywhere); `transient` and `rate_limited` advance to the next lane. Framing matches the YC "health-aware fallback / automatic failover" milestone rather than inventing new vocabulary.

**Findings from live testing (real keys, 2026-07-31; full detail in `docs/MUX-RESULTS.md`):**
- Sandbox images ship whatever Node they ship (E2B base v20.9.0, below Claude Code's floor of 22). Harnesses bootstrap a private Node 24.18.1 into `~/.agent-machines/node` and prefix PATH rather than depending on the image or sudo.
- `PATH=... cmd1 | cmd2` applies only to cmd1, so a prefixed pipeline died with exit 127. Use a brace group with `export`.
- `npm -g` is not portable: Sprites routes Node through nvm whose global bin is not on PATH, so `npm install -g` reported success and left the binary unfindable; pinning `npm_config_prefix` fixes the path but nvm hard-refuses that variable. Harnesses now install with `npm install --prefix $HOME/.agent-machines/pkgs`.
- Long installs must not be held on a connection (they outlived E2B's sandbox budget and tripped Sprites' WS keepalive). Installs write a script, launch detached, and poll an exit-code sentinel.
- Sprites' HTTP exec waits for the whole process group, so setsid/nohup do not detach (a `sleep 45` payload returned in 45.2s). Background work goes to the sprite's tmux server. Two traps: a detachable exec session is not a substitute (closing its socket reaps the payload), and the launcher must ride the base64-wrapped `exec` path or tmux reports success while running nothing.
- Sprites auto-suspends on idle and background work does not keep it awake; the 1.5s install poll is what keeps it warm.
- Sprites `create` returns intermittent 500s that still create the sprite, so a naive retry then 409s. Named creates are now get-or-create.
- OpenClaw needs a session target even for `--local` one-shots, and its `--json` is pretty-printed, so it needs a brace-depth accumulating parser rather than line-at-a-time NDJSON.
- A `vck_` key is Vercel AI Gateway auth, not Sandbox auth; the vercel lane fails closed saying exactly that.

**Not working, and why:** Hermes will not install on E2B's default template. Its curl installer builds a Python venv plus Node browser deps and exhausts the base sandbox (478 MB, 2 vCPU); the VM stops answering RPCs after ~150s, and E2B ignored a larger `resources` request on this plan. `CreateSandboxOptions` now carries `template` and `resources` so callers can ask for more, and the adapter marks Hermes heavy-install: it wants a pre-baked image, not a per-machine install. The other three agents pass on both credentialed substrates.

**Web:** Restored the footer PCB art at a footer-only path (`.ret-circuit-texture` is shared by five components, so reverting the shared asset would have changed the hero, navbar and workflow surfaces). Remounted `StatsRow` and rewrote it around the real `createMux` API -- the previous snippet's lowercase `am` alias would have thrown at runtime and its `persistent` field was dropped before the wire (now transmitted). Added a two-plane diagram and a dashboard sandbox-router panel whose capability mirror is drift-tested against `src/mux`.

**Verification:** 83 mux tests, 3 SDK tests, 16 new web tests; root and web typecheck clean; live matrix green for claude-code/codex/openclaw on e2b and sprites. One pre-existing web test failure (`matchPackages` memory case) is unrelated and left untouched.
