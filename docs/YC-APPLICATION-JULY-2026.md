# Agent Machines — YC application rewrite

**Updated:** July 31, 2026  
**Recommended wedge:** OpenRouter for AI agent sandboxes  
**Expansion:** the control plane for persistent agent workers

This is a batch-neutral rewrite. If this is for Fall 2026, change the old “S26” label before submitting. Bracketed items require founder input; they are not safe to infer from the repository.

## Editorial verdict

The May draft has the right underlying observation—agent execution infrastructure is fragmented—but it tries to sell too many companies at once: ChatGPT for nontechnical users, Vercel for agent deployment, Datadog for observability, OpenRouter for routing, and an agent-to-agent fleet protocol.

The clearest company is:

> **Developers call one API to run an agent. Agent Machines chooses and operates the best sandbox for the job.**

That is a concrete developer pain, a legible buyer, and a credible path from what is already built. The persistent-worker dashboard is valuable, but it should demonstrate and expand the router—not compete with it for the first sentence.

Use this hierarchy consistently:

1. **Wedge:** hosted routing across sandbox providers.
2. **Why users switch:** one integration, capability-aware selection, live benchmarks, fallback, and eventually one bill.
3. **Why Agent Machines can win:** it already operates real agents across four substrates, so routing is optimized for completed agent work rather than raw container creation.
4. **Expansion:** bootstrap, persistence, browser console, logs, usage, schedules, skills, and fleets.

### 50-character description

> **OpenRouter for AI agent sandboxes.**

### Plain-English description

> Agent developers use one API to run an agent. We choose and provision the sandbox that best fits the task, then normalize execution, streaming, persistence, logs, and lifecycle across providers.

## What has already been accomplished

These claims were checked against the public repository on July 31, 2026.

| Area | Shipped or implemented |
|---|---|
| Public product | `agent-machines.dev` is live and the repository is public under MIT. |
| Build velocity | 230 public commits since May 5, 2026; Kevin authored 229. |
| Sandbox abstraction | Four concrete `MachineProvider` implementations: E2B, Sprites, Vercel Sandbox, and Dedalus. |
| Normalized lifecycle | Provision, state, wake, sleep, destroy, exec, and streaming where the provider supports it. |
| Agent runtimes | Hermes, OpenClaw, Claude Code, and Codex. |
| Developer API | A typed SDK with `agent`, `sandbox`, and `model` routing plus user-scoped API keys. |
| Provider intelligence | A cross-provider benchmark engine covering provision, readiness, cold start, exec latency, CPU, disk, wake, teardown, and reliability. |
| Adaptive routing | A task-aware routing policy and recommendation endpoint that learns from success, cost, latency, and provider benchmark priors. |
| Remote operation | A browser console that runs the real agent CLI through tmux-over-exec and SSE without a long-lived PTY server in the control plane. |
| Worker control plane | Fleet pages, bootstrap state, terminal, cron, sessions, logs, artifacts, usage, registry, loadout, workers, and Memory bundles. |
| Harness | 161 bundled `SKILL.md` procedures, 39 MCP catalog entries, 27 service lanes, and 24+ CLI tools in the current registry-derived product metadata. |
| Verification | 3 SDK tests and 241 web tests pass; both TypeScript projects typecheck. |

This is much stronger than “I have an idea for an agent control plane.” The story is now: **I built the multi-provider execution layer, discovered that provider choice is itself the product, and am turning the existing switchboard into an automatic router.**

## Modern landscape: what changed since May

The market validates the problem but invalidates several absolute claims in the old draft.

### 1. Sandbox supply is exploding

E2B, Modal, Daytona, Vercel Sandbox, Cloudflare Sandbox, Sprites, Runloop, Blaxel, CodeSandbox, and others now expose different combinations of isolation, persistence, snapshots, GPUs, network policy, ports, and lifecycle behavior. Cloudflare now explicitly positions its Sandbox SDK for agents that need a real filesystem, shell, packages, and long-lived project state. This makes provider choice more important, not less.

Sources: [Cloudflare Sandbox for Agents](https://developers.cloudflare.com/agents/tools/sandbox/), [Modal Sandboxes](https://modal.com/docs/guide/sandboxes), [Vercel Sandbox vs. E2B](https://vercel.com/kb/guide/vercel-sandbox-vs-e2b).

### 2. A normalized SDK is already competitive, not unique

ComputeSDK already offers a common API across many providers, priority or round-robin strategies, and fallback on error. TanStack AI Sandbox already separates agent harnesses from sandbox providers and normalizes provider capabilities such as snapshots, durable filesystems, network policy, and forks.

Sources: [ComputeSDK introduction](https://docs.computesdk.com/getting-started/introduction), [ComputeSDK GitHub](https://github.com/computesdk/computesdk), [TanStack AI sandbox providers](https://tanstack.com/ai/latest/docs/sandbox/providers).

Therefore, do not claim “nobody has built this” or define the company as four provider adapters. The answer must be: **libraries normalize calls; Agent Machines is the hosted decision and operations layer.**

### 3. Agent control planes are also crowded

Omnara calls itself a model-agnostic control plane for managed agents. Pentagon calls itself the control plane for agent-native work. Cloudflare combines its Agents SDK with Sandboxes. The phrase “control plane for agents” is no longer differentiation by itself.

Sources: [Omnara](https://www.ycombinator.com/companies/omnara), [Pentagon](https://www.ycombinator.com/companies/pentagon), [Cloudflare Agents Sandbox](https://developers.cloudflare.com/agents/tools/sandbox/).

### 4. The sharper opening is routing, not “persistent agents for everyone”

The current buyer is an agent developer or platform team integrating sandbox vendors—not 95% of consumers. Developers already understand provider fragmentation, failures, pricing, and capability mismatch. Win that technical wedge first. The same routed machines can later power opinionated workers for broader users.

### 5. Current YC language is favorable, but should not substitute for users

YC’s Fall 2026 RFS includes “A Cloud for Small Software,” and Summer 2026 included “Software for Agents.” Agent Machines overlaps both, but the application should mention this only after explaining the user pain and shipped product.

Source: [YC Requests for Startups](https://www.ycombinator.com/rfs).

## What “OpenRouter for sandboxes” must mean

OpenRouter is a useful analogy only if the product becomes more than a dropdown.

| Router property | Current state | Next proof |
|---|---|---|
| One API | Implemented for create/bootstrap/run | Publish and dogfood a stable `am.run()` surface |
| Multiple providers | Four adapters implemented | Add providers based on customer demand, not logo count |
| Normalized capabilities | Basic lifecycle and streaming implemented | Add region, GPU, network policy, snapshot, port, persistence, and max-runtime constraints |
| Intelligent selection | Advisory task-aware recommender implemented | Make selection automatic with an explicit policy and explanation |
| Health-aware fallback | Not yet safe to claim | Add provider health, idempotent replay, and automatic failover |
| Price optimization | Reward model accepts cost | Ingest current prices and optimize total successful-run cost |
| One bill | Not implemented; current setup is BYOK | Add credits or provider resale agreements after design-partner usage |
| Observability | Dashboard and metrics surfaces implemented | Report task success, time-to-first-output, total cost, and resume reliability by route |

The routing unit should be a completed agent run, not a sandbox minute. Optimize for:

- task success;
- total cost to a successful result;
- time to first useful output;
- resume and persistence reliability;
- security and capability constraints;
- provider availability.

## Claims to use and claims to remove

### Safe, specific claims

- “We support four sandbox providers behind one interface.”
- “We support four agent runtimes.”
- “We built a cross-provider lifecycle benchmark suite.”
- “We implemented a task-aware route recommender using success, cost, latency, and provider reliability.”
- “We built a browser console for the real remote agent CLI.”
- “The public repo has 230 commits since May 5 and 244 passing tests.”
- “Today users bring provider keys; unified billing and automatic fallback are next.”

### Remove or qualify

- “Nobody has built the combined primitive.” ComputeSDK and TanStack are direct counterexamples at the library layer.
- “No competitor is building this.” Several are.
- “One account means no provider onboarding.” Today the product is BYOK.
- “Automatic routing.” Today the recommender is advisory.
- “Deploys in 30 seconds.” Keep only if measured across named providers and shown in the demo.
- “161 production-tested skills.” The repository proves 161 bundled skills, not that every one is production-tested.
- “Used internally at Dedalus.” Use only with explicit permission and describe exactly by whom.
- “The MCP/CLI lets agents provision agents.” The current whitepaper labels this roadmap.
- “Memory companies disappear because memory is a file.” This is dismissive and technically incomplete.
- “Models are commodities.” Unnecessary and likely to age badly.
- Unverified TAM, CAGR, and adoption percentages. YC will care more about users, usage, and spend.

---

# Revised application answers

## Company name

Agent Machines

## Describe what your company does in 50 characters or less

OpenRouter for AI agent sandboxes.

## Company URL

https://www.agent-machines.dev

## Product link

https://www.agent-machines.dev

## What is your company going to make?

Agent Machines is an OpenRouter for AI agent sandboxes. Developers call one API to run an agent; we select and provision the sandbox that best fits the job, then normalize execution, streaming, persistence, logs, and lifecycle across providers.

Sandbox providers differ materially. One has durable disks, another has better cold starts, another has GPUs, another has network controls, and each has different APIs, failure modes, and billing. Agent teams currently integrate providers one by one and hard-code a choice before they know how the workload behaves. We want sandbox choice to become an infrastructure policy, not application code.

Today we have four implemented provider adapters—E2B, Sprites, Vercel Sandbox, and Dedalus—behind one `MachineProvider` interface. We also support four agent runtimes: Codex, Claude Code, Hermes, and OpenClaw. We built a cross-provider benchmark engine and a task-aware routing recommender that scores runtime, substrate, model, and model route using observed success, cost, latency, and provider reliability.

The current product is BYOK and the recommendation is human-confirmed. Next we are making routing automatic, adding health-aware fallback, and moving toward one bill. On top of the router, we already provide the full worker control plane: agent bootstrap, browser terminal, persistent state, logs, usage, cron, skills, and fleet supervision. That lets us optimize for completed agent work rather than raw container boot time.

ComputeSDK and TanStack normalize provider APIs as libraries. We are building the hosted routing and operations layer: one API, live performance data, route selection, fallback, observation, and eventually unified billing.

## Where do you live now, and where would the company be based after YC?

San Francisco, USA / San Francisco, USA

## Explain your decision regarding location

I moved to San Francisco while studying at Princeton because the users and infrastructure companies I work with are here. I have spent **[UPDATE: exact number]** months working forward-deployed at Dedalus Labs, where I learned the operational differences between agent workloads and the sandboxes underneath them. Agent Machines will stay in San Francisco because the early customers, provider partners, and people building this stack are concentrated here.

Avoid the old “I learned more here than at Princeton” comparison. The operational reason is stronger and less performative.

## How far along are you?

The product is live at agent-machines.dev and the code is public under MIT. Since the first commit on May 5, 2026, I have shipped 230 commits.

What works today:

- Four sandbox providers behind one lifecycle interface: E2B, Sprites, Vercel Sandbox, and Dedalus.
- Four agent runtimes: Hermes, OpenClaw, Claude Code, and Codex.
- A typed SDK and authenticated API for provision → bootstrap → run.
- A benchmark engine for provision time, readiness, cold start, exec latency, CPU, disk, wake, teardown, and reliability.
- A task-aware route recommender trained on run success, cost, latency, and provider benchmark priors.
- A browser console for the real remote agent CLI using tmux-over-exec and SSE.
- Fleet lifecycle, bootstrap state, cron, sessions, logs, artifacts, usage, workers, Memory bundles, and an install registry.
- 161 bundled skills, 39 MCP catalog entries, 27 service lanes, and 24+ CLI tools.
- 244 automated tests passing across the SDK and web control plane; both TypeScript projects typecheck.

The honest boundary: users currently bring their own provider credentials and confirm the recommended route. Automatic fallback and unified billing are not live yet.

**[UPDATE BEFORE SUBMITTING: external users, weekly runs, sandbox hours, active machines, retention, and any revenue. These matter more than feature count.]**

## How long have each of you been working on this? How much of that has been full-time?

I started Agent Machines in May 2026 and have worked on it for roughly 12 weeks as of July 31. I built it alongside my role at Dedalus Labs, so **[INSERT: honest hours/week and dates]** rather than calling two simultaneous jobs “full-time.” The public history shows 230 commits; I authored 229 of them.

The first version was a tool for comparing agent workloads across sandbox providers. It grew into a normalized lifecycle layer, then a browser control plane, then a benchmark-driven routing system. **[CONFIRM: describe the exact employment/IP arrangement and whether Dedalus has acknowledged in writing that Agent Machines is a separate project.]**

## What tech stack are you using?

The control plane is Next.js 16, React 19, TypeScript, Clerk, and Supabase. Each provider implements a common TypeScript `MachineProvider` contract for provision, state, wake, sleep, destroy, exec, and streaming. The current providers are E2B, Sprites, Vercel Sandbox, and Dedalus.

The SDK and CLI are Node.js/TypeScript. Agent runtimes are Hermes, OpenClaw, Claude Code, and Codex. The browser console uses xterm.js, tmux on the worker, stateless HTTP input, and SSE output. Route learning uses successful-run, latency, cost, and reliability aggregates stored in Supabase. Model traffic can use Vercel AI Gateway, OpenRouter, native OpenAI/Anthropic keys, or a compatible endpoint where the selected runtime supports it.

## Are people using your product?

**Use one of these only after updating the numbers.**

### If usage is still internal only

I use it in my own work and **[N]** people at **[organization/context, with permission]** have used it for **[specific workflow]**. There are no external paying users yet. The public repo has 15 stars and 3 forks as of July 31. My immediate goal is 5–10 design partners who already operate coding or research agents across sandbox providers.

### If external users now exist

Yes. **[N] weekly active users / teams** ran **[N] agent jobs** consuming **[N] sandbox hours** in the last four weeks. **[N]** use more than one provider, **[N]%** returned the following week, and **[N]** pay **[$].** The most common workflow is **[workflow].**

Do not answer “yes” and then disclose only personal usage. YC will notice.

## Do you have revenue?

No. **[Replace if this has changed.]**

## Why did you pick this idea to work on? Do you have domain expertise?

I encountered the problem while working at Dedalus Labs. To compare Dedalus with other sandbox providers, I had to write the same lifecycle, bootstrap, streaming, persistence, and observation plumbing several times. The providers were not interchangeable: the right choice changed with workload duration, disk requirements, wake behavior, streaming support, and failure mode.

I first built Agent Machines as a benchmark tool. Once the same agent could run across several substrates, the valuable question stopped being “can I wrap these APIs?” and became “which route should this task use, and did it finish successfully?” That led to the current benchmark engine and adaptive routing policy.

My relevant experience is unusually direct:

- **[UPDATE]** months forward-deployed at an agent infrastructure company, shipping user-facing and machine-lifecycle work.
- Four sandbox provider integrations and four agent runtime integrations in this repository.
- A provider benchmark engine, adaptive route recommender, remote browser console, and persistent-worker control plane built end to end.
- Research with Professor Danqi Chen at Princeton on **[use the exact, approved description of the work; do not overstate advising or affiliation].**
- Previous agent harness work at Amazon **[specify what can be said publicly].**

I picked this because I had the problem myself, built the first solution for myself, and now have the technical substrate to test the routing thesis with real users.

## Who are your competitors? What do you understand that they don't?

There are three groups of competitors.

First are sandbox providers such as E2B, Modal, Daytona, Vercel Sandbox, Cloudflare, Sprites, Runloop, and Blaxel. They optimize their own infrastructure. We route across them. Their continued improvement and specialization make a neutral routing layer more useful.

Second are abstraction libraries. ComputeSDK already provides a common API, priority/round-robin routing, and error fallback across many providers. TanStack AI Sandbox normalizes providers and agent harnesses with a strong capability model. They are the closest technical competitors, and they disprove the claim that a provider interface alone is a company.

Third are agent control planes such as Omnara and Pentagon. They focus on operating and coordinating agents. Our wedge is lower in the stack: choosing and operating the execution substrate behind each agent run. Our worker dashboard is how we observe and prove that routing.

What I understand is that sandbox APIs can be normalized, but sandbox outcomes are not fungible. Provider capabilities and performance vary by task, region, duration, persistence, security policy, and failure mode. A static adapter or round-robin strategy leaves the important decision in application code. The router should learn from completed jobs and optimize the total cost, latency, and reliability of a successful agent result.

Today our advantage is not provider count—ComputeSDK has more. It is that we have already joined provider routing to real agent bootstrap, task outcomes, observation, and persistent lifecycle. The next proof is automatic fallback and design-partner usage, not another long feature list.

## How do or will you make money? How much could you make?

We will charge for routed sandbox usage: one bill covering underlying compute plus a platform margin, similar to other infrastructure gateways. Teams will also pay for shared policies, budgets, audit logs, private networking, and fleet controls.

We are starting BYOK because it lets us learn workload and routing behavior without waiting for reseller agreements. After we have repeat usage, we will add prepaid credits or provider resale so customers no longer need four accounts. At scale, provider volume discounts and better utilization should expand gross margin while still lowering the customer’s total cost per successful run.

A plausible initial business is 10,000 agent teams spending an average of $1,000 per month on routed compute and control-plane features, or $120M ARR. If agents become a default consumer of cloud sandboxes, the routing layer can be much larger. The immediate test is whether teams will move real workloads and spend through one API.

Do not promise “unlimited compute” at a fixed $29 price.

## Other ideas considered

1. A marketplace for self-updating `SKILL.md` procedures. I built a large internal library, but distribution and quality are hard without owning the execution loop. Agent Machines can include this later.
2. Agent-native CI/CD. The sandbox router can serve this workload, but starting with CI/CD would narrow the platform before we know which agent workloads pull hardest.
3. An agent-to-agent provisioning protocol. This is more useful as an API on top of a working execution network than as a standalone standard.

## Who writes code on your product?

I do. I authored 229 of the 230 commits in the public repository, including the provider abstraction, four provider integrations, SDK, API authentication, benchmark engine, route learning, browser terminal, bootstrap system, dashboard, and agent runtime integrations. One external contributor authored one commit.

## Are you looking for a cofounder?

**The source draft contradicts itself: one answer says solo and looking; later notes repeatedly say “Aryan and I.” Resolve this before submitting.**

### If solo

Yes. I am looking for a cofounder who wants to own distributed systems and infrastructure operations. I have spoken with **[names/status only if useful]**, but nobody has joined or received equity. I will continue building regardless.

### If Aryan has joined

No. Aryan **[full name]** joined as cofounder in **[month]**. We met at Dedalus, where we worked together on **[specific work]**. He owns **[area]**, has contributed **[hours/output]**, will leave **[employment]** on **[date]**, and we have agreed to **[equity split].**

Do not describe someone as a cofounder based only on intent to join later.

## Applied before / pivot?

Yes. I previously applied with Athan Zhang on a different idea. YC asked whether we were ready to leave school. We ultimately split; Athan started Copperlane and I joined Dedalus Labs to work directly on agent infrastructure.

This is a different company and came from that operating experience. The first commit was May 5, 2026. Since then I have built four provider integrations, four agent runtime integrations, a benchmark engine, adaptive routing, an SDK, a browser console, and the rest of the public control plane. I am applying now with working software and a much narrower insight: agent developers need a router for sandbox execution.

**[Verify the current batch and Copperlane batch/status before submitting.]**

## Incubator/accelerator participation?

**[FILL.]**

## What convinced you to apply to YC?

The last time I applied, YC forced me to confront whether I was actually willing to choose a startup path. I spent the following months working inside agent infrastructure and building Agent Machines from a tool I needed myself.

The product is now real, but the company still has a decisive open question: will agent teams route production sandbox spend through a neutral layer? YC is useful now because I need concentrated access to design partners, pressure to narrow the API and pricing, and speed in turning a technically broad control plane into a simple product people pay for.

The current YC RFS around software for agents and clouds for small software reinforces the timing, but I am applying because I have built the system and found a specific user problem—not because the idea appeared in an RFS.

## How did you hear about YC?

**[FILL.]**

## Have you formed a legal entity?

**[FILL.]**

## Have you taken investment?

**[FILL.]**

## Are you currently fundraising?

**[FILL.]**

## Employment and IP question YC is likely to ask

> Agent Machines is a separate, public MIT-licensed project. I disclosed it to Dedalus **[when/how]** and **[have / do not yet have]** written confirmation regarding outside-project IP. I built it **[on personal/company equipment and time—state exactly]**. Dedalus is a supported provider, not the product, and the architecture also supports E2B, Sprites, and Vercel Sandbox.

Get the underlying facts and documentation clean before the interview. The old wording “I built this at Dedalus” creates avoidable ownership ambiguity.

---

# Revised founder video script (about 60 seconds)

> Hi, I’m Kevin. While working on agent infrastructure at Dedalus, I kept rebuilding the same integration every time I tried a different sandbox: lifecycle, persistence, streaming, bootstrap, and logs.
>
> So in May I started Agent Machines—an OpenRouter for AI agent sandboxes. Developers use one API to run an agent, and we choose and operate the best sandbox for the job.
>
> In twelve weeks I shipped 230 commits: four sandbox providers, four agent runtimes, a typed SDK, a cross-provider benchmark engine, adaptive route recommendations, and a browser terminal for the real remote agent. The repo is public and 244 tests pass.
>
> Today users bring their own provider keys and confirm the route. Next I’m making routing automatic, adding failover, and putting it behind one bill.
>
> I’m applying because agent compute is fragmenting quickly, and I’ve already built the switchboard that can become its routing layer.

If Aryan is a real cofounder, this video must include both founders and their division of work.

# Revised demo video outline (3 minutes)

## 0:00–0:20 — Show the API, not the landing page

Open with a real SDK call:

```ts
const agent = await am.create({
  agent: "codex",
  sandbox: "e2b",
  model: "openai/gpt-5",
});

await agent.run("Fix the failing test and explain the change.");
```

Say: “This is one API for an agent runtime, a model path, and a sandbox.”

Use a model/runtime combination that the credential gate actually supports in the demo environment.

## 0:20–0:55 — Same worker flow, different substrate

Switch the sandbox to Sprites or Vercel and show the same lifecycle and output contract. Do not wait through a long live install; have one warm route and one pre-recorded cold route ready.

Say: “The providers have different APIs and capabilities. Agent Machines normalizes provision, state, exec, stream, sleep, wake, and destroy.”

## 0:55–1:25 — Show the routing intelligence

Open the benchmark matrix. Show real measured values and then the route recommendation.

Say: “We measure cold start, exec latency, disk, wake, and reliability. The recommender combines those priors with completed-run success, cost, latency, task class, runtime, model, and substrate.”

Be explicit: “Today this recommendation is advisory. Automatic fallback is next.”

## 1:25–2:05 — Show what the router operates

Open the browser console and attach to the real Codex, Claude Code, Hermes, or OpenClaw CLI on the remote machine. Run a short command, refresh the page, and show that the tmux session persists.

Say: “This is why we can route outcomes rather than empty boxes. We bootstrap and observe the actual agent worker.”

## 2:05–2:35 — Show observation and persistence

Show machine state, logs, usage, an artifact, and one scheduled job. Keep the tour to four surfaces maximum.

Say: “The same control plane records whether the route worked, how long it took, and what it cost. That data improves future routing.”

## 2:35–3:00 — Close on the current boundary

Say:

> “Four providers and four runtimes work behind one control plane today. Users currently bring provider keys and approve the route. We are building automatic health-aware fallback and unified billing. OpenRouter made model APIs interchangeable; Agent Machines is doing that for the computers agents work on.”

---

# Likely interview questions

## Isn’t this ComputeSDK?

ComputeSDK is the closest competitor and has more provider adapters than we do. It is an open-source library that normalizes sandbox calls and offers static priority or round-robin fallback. Agent Machines is a hosted routing and operations layer. We benchmark providers, observe completed agent runs, recommend a route by task/runtime/model/substrate, bootstrap the worker, and expose its lifecycle and outcome in one control plane. The proof we still need is automatic fallback and customer spend through our API.

## Isn’t TanStack AI Sandbox already runtime × provider?

TanStack validates the abstraction and is a serious competitor. It gives application developers composable provider and harness packages. We are building the managed network above that layer: continuously measured routes, health and cost policy, a stable hosted API, fleet observation, and eventually one bill. We should be compatible with good open-source standards rather than pretending they do not exist.

## Why won’t E2B or Vercel build this?

A provider is economically motivated to route workloads to itself. Neutrality is the product. Providers can still move up-stack, so our defense must be multi-provider demand, real route-performance data, migration convenience, and customers who prefer one policy and bill. “They sell boxes” is not enough.

## Why start with four providers when ComputeSDK supports many more?

Provider count is not the goal. We started with four because we operate full agent workers on them and can measure lifecycle behavior end to end. We will add the next provider when a design partner has a workload that the current four cannot serve. Depth and real traffic matter more than a logo wall.

## Is this actually a router today?

It is a switchboard with an implemented adaptive recommender today. The user still confirms the route and supplies provider credentials. The next milestones are automatic constraint filtering, live health, failover, and unified billing. We should say this plainly.

## What is the moat?

Not adapters. The potential moat is route data tied to real task outcomes, customer workload affinity, one-bill convenience, and the operational layer that can replay or migrate persistent workers safely. Skills and dashboards are product depth, not a standalone moat.

## Who is the first customer?

Teams building coding, research, or app-generation agents that already use one sandbox provider and are considering a second for reliability, persistence, GPU, region, or price. Find teams with real sandbox spend; do not start with generic consumers who have never deployed an agent.

---

# Before submitting

1. Resolve solo vs. Aryan cofounder status everywhere.
2. Clarify Dedalus IP, outside-work permission, equipment, time, and departure date in writing.
3. Replace every personal time reference: age, school year, Dedalus tenure, hours/week, graduation plan, and batch availability.
4. Add actual usage: external teams, weekly jobs, sandbox hours, active machines, repeat usage, and revenue.
5. Run at least one measured job on each claimed provider and save the benchmark output.
6. Decide whether the live product’s primary CTA is the router API or the worker dashboard; the YC story should match the first five minutes of the product.
7. Fix public documentation inconsistencies before review: the current README example pairs Codex with an Anthropic model even though the credential gate says Codex requires native OpenAI, and some README text still says 35 MCP servers while the current catalog and site say 39.
8. Do not add more features until five design partners explain why they need a second sandbox provider.
