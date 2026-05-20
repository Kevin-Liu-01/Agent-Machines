# YC S26 Application -- Agent Machines

---

## Bay Area Landscape Analysis (May 2026)

### The stack that's crystallizing

The Bay is building layers. Nobody has built the combined primitive:

| What people are building | Players | The problem |
|---|---|---|
| **Containers** (bare compute) | E2B, Modal, Fly, Dedalus | Nobody wants a bare container. |
| **Frameworks** (agent logic) | LangGraph, CrewAI, OpenClaw | Logic without a persistent home. |
| **Memory** (bolt-on state) | Mem0 ($24M), Letta ($10M) | Band-aid on stateless models. |
| **Models** (raw intelligence) | OpenAI, Anthropic, Google | Commodity. Falling prices. |

Everyone treats containers and agents as separate things -- a container you put an agent into, or an agent you give a sandbox to. **The actual primitive people want is the persistent agent-on-a-machine.** Not a bare VM. Not a stateless framework. The combined unit: an agent with a home, skills, services, memory, and scheduling -- ready to work.

Agent Machines ships that combined primitive. And the reason people care about containers at all in this context is to run persistent agents -- so we're the layer that gives the container market its primary use case.

The parallel: before ChatGPT, you needed API keys and Python to use GPT-3. OpenAI didn't invent the model -- they invented the interface. Same here. Containers exist. Frameworks exist. But the combined "deploy a persistent agent" primitive with an accessible interface? Missing.

### The two audiences -- and the programmatic endgame

**Audience 1: Humans** -- Today's agent tools (Cursor, Claude Code, OpenClaw CLI) are expert-only. Terminals, SSH, MCP configs. 95% of people who want persistent agents working for them aren't sysadmins. They need a visual interface: provision from a template, watch it work, drop in customizations. That's our dashboard.

**Audience 2: Other agents** -- This is the endgame. An MCP server and CLI that lets a head agent programmatically spin up, coordinate, and tear down specialized agent machines. One orchestrator agent managing a fleet: "spin up a code review agent, a research agent, and a deploy agent -- route this task across all three." The interface serves humans first, then becomes the API surface for agent-to-agent coordination.

This is what makes the combined primitive powerful: when agents can provision other agents via MCP, the platform becomes self-scaling. Every agent machine is both a worker and a potential orchestrator.

**The enterprise gap is also real**: ServiceNow, Microsoft Foundry, and Guild.ai published "agent control plane" strategies in 2026. But they're building for enterprises with 18-month sales cycles. We start with developers and their agents today, grow into teams, then enterprise. Bottom-up, like Datadog and Vercel.

### Why the combined primitive wins

Individual layers (bare VMs, memory stores, frameworks) are commodity. The combined "persistent agent" primitive is not:

- A bare container has no value until an agent lives on it. We are the reason people buy containers.
- Memory is one feature of a persistent agent, not a product. Mem0's moat disappears when the agent has a real filesystem.
- Frameworks define logic but don't deploy, persist, observe, or schedule anything. We do all of that.

**The primitive is agent+machine, not machine alone.** We package the full unit: runtime, skills, services, scheduling, observation -- on any substrate. The interface to deploy, watch, and customize that unit is where all value accrues.

### What makes this defensible

1. **The skill protocol (SKILL.md)** -- a structured, versioned format where every complex task becomes a reusable agent procedure. 155 ship pre-loaded. Compounds with every session. No one else has a protocol for agents to learn, share, and version procedures. This is npm for agent intelligence.

2. **The combined harness** -- 155 skills, 17 MCP service integrations, 10+ closed-loop CLIs (agent-browser, Playwright, curl, httpx, sqlite3), 15+ built-in tools (terminal, filesystem, browser, vision, cron, TTS, Python sandbox), 4 agent runtimes (Hermes, OpenClaw, Claude Code, Codex CLI), Cursor IDE delegation, and a 14-command management CLI. 6 months of battle-tested tooling that deploys as a single unit in 30 seconds. The harness IS the product -- the container is just where it runs.

3. **The observation layer** -- session playback, skill invocation tracking, cost attribution, log correlation. You can't orchestrate what you can't see. This is what makes us the interface, not just another CLI. Same stickiness as Datadog.

4. **The MCP/CLI surface for programmatic control** -- our interface isn't just a dashboard for humans. It's an MCP server and CLI that agents themselves can call. A head agent provisions specialized machines, routes tasks, tears down workers -- programmatically. This makes the platform self-scaling: agents are both consumers and orchestrators of other agents.

---

## Application Answers

### Company name
Agent Machines

### Describe what your company does in 50 characters or less
Persistent AI agents as a one-click primitive.

### Company URL
https://www.agent-machines.dev

### Product link
https://www.agent-machines.dev

### What is your company going to make?

Agent Machines deploys persistent agents as a single combined primitive: an agent with a home, skills, services, memory, scheduling, and observability -- on any container substrate. The interface lets you provision, watch, and customize these agents without understanding the underlying infrastructure.

Right now the Bay is building every layer separately: containers (E2B, Modal, Fly, Dedalus), frameworks (LangGraph, CrewAI, OpenClaw), memory (Mem0, Letta), models (OpenAI, Anthropic). Everyone treats containers and agents as separate things, either a container you put an agent into, or an agent you give a sandbox to. **The actual primitive people want is the persistent agent-on-a-machine.** The entire interest in containers/microVMs is to run persistent agents, so we're the layer that gives the container market its primary use case. We ship that combined unit directly, instead of making you assemble an agent from a VM + a framework + a memory provider + tool configs + cron + MCP servers. The goal is to become the de facto persistent agent provider, not another sandbox provider.

**How it started**: I built this at Dedalus Labs to dogfood and benchmark our own microVMs against E2B, Fly, and Modal. I needed to deploy agents across substrates, observe what they were doing, and compare. The observation layer became more valuable than the benchmarking. Once I could see agents working in real-time, I wanted to control them: schedule work, manage lifecycle, insert new skills. The benchmarking tool became an observation layer, then an orchestration layer, then the full interface.

**What you can use today:**

- **The combined primitive**: Deploy a persistent agent in 30 seconds. 155 skills, 17 MCP service integrations, 10+ closed-loop CLIs, 15+ built-in tools, browser automation, Cursor IDE delegation, cron scheduling -- all in one unit, using any substrate. We ship far more than a bare container you build on top of.
- **Visual observation**: Watch agents work in real-time through the dashboard. Sessions, tool calls, skill invocations, and cost -- all visible without SSH or log-tailing.
- **Opinionated templates + insertion layers**: Works out of the box. But every layer is customizable -- drop in skills, attach providers, connect services/plugins/MCP, set governance, change the container substrate.
- **Customizability**: Switch between substrates, model providers, SDKs, APIs, MCPs, plugins, and tools in clicks. One account, no confusing onboarding.
- **Self-healing / skill accumulation**: Every complex task becomes a reusable procedure. After 6 months, I have hundreds of custom skills. New users inherit the community library (155 today, growing).
- **Programmatic control (the endgame)**: An MCP server and CLI so agents themselves can provision and coordinate other agent machines -- no UI required. One head agent spins up a fleet of specialized workers, routes tasks, observes results, tears down idle machines. The interface serves humans today, with the goal of becoming an API for agent-to-agent orchestration.

We serve two audiences. **Humans first**: today's agent tools (Cursor, Claude Code, OpenClaw CLI) are expert-only. Terminals, SSH, MCP configs are your primary interface, even though 95% of people who want persistent agents aren't sysadmins. There is such an untapped market here it's almost frustrating. Agent Machines solves observability and comprehension at once through one accessible interface -- provisioning, auto-scaling, skill usage, and more. **Other agents second (the endgame)**: this project began as a devtool and will evolve to primarily be a superior devtool, offering an MCP server and CLI so a head agent can programmatically spin up, coordinate, and tear down specialized agent machines from one orchestrator managing a fleet. When agents can provision other agents, the platform self-scales.

The enterprise gap is real too: ServiceNow, Microsoft Foundry, and Guild.ai published "agent control plane" strategies in 2026, but they don't come close to the problem of true persistence and full end-to-end observability -- offering only UI components to visualize agents -- and are building for 18-month enterprise sales cycles. We start with developers and their agents today, make them love the product, grow into teams, then enterprise. Bottom-up, like Datadog and Vercel.

### Where do you live now, and where would the company be based after YC?

San Francisco, USA / San Francisco, USA

### Explain your decision regarding location

I'm a Princeton sophomore (19) graduating early -- one of two in my class. I chose to spend 2026 in SF rather than on campus. After 6 months here, I've learned more than I did in 1.5 years at Princeton. I'm forward-deployed at Dedalus Labs, embedded in the agent infrastructure ecosystem, shipping product alongside the substrate providers and developers who are our customers. I will learn and build more and faster here than anywhere else. The company stays in SF.

### How far along are you?

Live product at agent-machines.dev, used internally and open source. Full control plane operational:
- CLI that deploys a fully-harnessed agent in 30 seconds (`npm run deploy`)
- Web dashboard: multi-machine management, chat, skills browser, session viewer, log tail, artifacts, usage tracking
- 155 production-tested skills in the protocol
- 17 MCP service integrations (Vercel, Stripe, Supabase, GitHub, Linear, Slack, Figma, PostHog, Sentry, Datadog, Firebase, Shopify, ClickHouse, Cloudflare, AWS, Clerk, browser automation)
- 10+ closed-loop CLIs (agent-browser, Playwright, curl, httpx, sqlite3, jq, dig, nc)
- 15+ built-in tools (terminal, filesystem, browser, vision, image gen, TTS, Python sandbox, cron, memory, subagent delegation)
- 4 agent runtimes (Hermes, OpenClaw, Claude Code, Codex CLI)
- Coding agents use an integrated Cursor IDE delegation via MCP bridge (4 tools: cursor_agent, cursor_resume, cursor_list_skills, cursor_models)
- Cron-scheduled autonomous operation (agents run without human prompts)
- Dedalus microVMs as primary substrate, with E2B and Sprites.dev also supported, more providers planned
- Open source on GitHub

### How long have each of you been working on this? How much of that has been full-time?

~3 months on Agent Machines directly, full-time alongside my role at Dedalus Labs.

At Dedalus I'm not in one lane. I own everything user-facing, including frontend, own parts of the infrastructure, I've shipped product features end-to-end, I've written docs, I've done customer demos/calls and onboarding, I've debugged production issues at 2am. I built the agent-browser CLI that ships as a Dedalus product. I built internal tooling for machine lifecycle management using our fork of Cloud Hypervisor. I wrote the cookbook recipes and integration guides that developers use to onboard. I've been in the room for pricing decisions, GTM strategy, and partnership conversations. Six months forward-deployed at an early-stage infra startup teaches you things a CS degree never will: how to scope a release, how to talk to users, how distribution actually works, how to ship at hyperspeed. And how agents are an increasingly superior execution primitive, with capabilities exponentiated by persistence and cloud.

Agent Machines is a direct product of that experience. The observation layer came from benchmarking Dedalus machines against competitors. The skill protocol came from operating persistent agents on our own infrastructure and noticing that the same procedures kept getting rebuilt from scratch. The multi-substrate architecture came from integrating with E2B and Sprites.dev alongside Dedalus and seeing that the value is in the harness, not in any single provider.

### What tech stack are you using?

**Frontend**: Next.js 16, React 19, TypeScript, Tailwind v4, Clerk auth, React Three Fiber
**Backend/CLI**: Node.js + tsx, Dedalus SDK for machine provisioning
**Agent Runtimes/Harnesses**: Hermes, OpenClaw, Claude Code, Codex
**Infrastructure**: Dedalus Machines (VMs with persistent state, 250ms boot, sleep/wake, VM-level isolation), with E2B and Sprites as other options
**AI Models**: Claude Opus 4.7, GPT-5.5 (default), routable to 200+ models via Dedalus inference API (vendor-agnostic)
**AI Coding Tools**: Cursor, Claude Code, Codex
**MCP Services**: Vercel, Stripe, Supabase, GitHub, Linear, Slack, Figma, PostHog, Sentry, Datadog, Firebase, Shopify, ClickHouse, Cloudflare, AWS

### Are people using your product?
Yes, internally at Dedalus and in my own workflow. Open source on GitHub. No external paying users yet.

### Do you have revenue?
No

### Why did you pick this idea to work on? Do you have domain expertise?

For the past 6 months I've been forward-deployed at Dedalus Labs, wearing every hat, owning multiple domains, learning how a startup actually ships, distributes, and grows. The biggest lesson for me was that in a crowded landscape it's really a distribution game. The best infrastructure doesn't win. The infrastructure people can understand and adopt wins. And abstractions that provide infrastructure and condense the swarm of agentic tooling and associated plugins around agents into one reliable interface will win.

That's why I built Agent Machines. It started as a tool to dogfood and benchmark our own microVMs against E2B, Fly, Modal. The observation layer I built to watch agents became more valuable than the benchmarks, and gradually observation became orchestration. Agent Machines fills an observability and imagination gap. It's hard to imagine what you can do with a bare sandbox -- the use case is abstract. People even struggle to do this with agents besides with coding. But a persistent agent with skills, services, and scheduling? People get it immediately. And because we're simultaneously low-level (real VMs, real tools) and high-level (visual dashboard, templates), we give actual observability instead of a black box. We'll win on distribution because the product explains itself.

On the research side: I work with Professor Danqi Chen at Princeton, who is currently on sabbatical at Thinking Machines, but she made an exception to advise my research into agent orchestration variables. My research with her is directly relevant to orchestration: how agents coordinate, how to route tasks between specialized models, how multi-agent systems maintain coherence. The academic work informs the product and the product generates real data for the research. Few people have both the infrastructure experience (Dedalus) and the research foundation (Princeton NLP/agent orchestration) simultaneously.

Domain expertise is vertically integrated:
- Research on agent orchestration with Danqi Chen (Princeton / Thinking Machines)
- Forward-deployed at Dedalus Labs for 6 months (the microVM substrate. I know the infrastructure, the distribution, and the GTM from the inside)
- Built harnesses/agentic runtimes at Amazon
- Authored 155 production-tested skills, integrated 17 MCP services, installed 10+ closed-loop CLIs
- Operated persistent agents with autonomous cron for months
- Benchmarked agents across every major container/VM provider

Even the name itself is the primitive: agent machines are the simple solution that solves your persistence problem. And bonus, no one has taken it yet.

### Who are your competitors? What do you understand that they don't?

Everyone in the Bay is building one layer. Nobody has built the combined primitive. Our competitors are all in different layers, and we subsume or sit on top of each:

**Container/VM providers** (sell raw compute; we give it a reason to exist):
- **E2B / Modal / Fly.io / Daytona** -- Sell bare containers with varying levels of persistence support, filesystem support, highly varying start times. But nobody wants a bare container -- they want the persistent agent that lives on it. We are the primary use case for their product. We use them as substrate, like Vercel uses AWS.

**Memory bolt-ons** (one feature of the combined primitive):
- **Mem0** ($24M raised) / **Letta** ($10M) -- Bolt memory onto stateless agents. But memory is one file on a filesystem. When you ship the full primitive (agent + machine + skills + services), memory is a trivial included feature, not a separate product.

**Agent frameworks** (logic without a home):
- **LangGraph / CrewAI / Codex** -- Define agent logic. Don't deploy it, persist it, observe it, or schedule it. Agent Machines is the deploy-and-manage layer that makes frameworks useful in production.

**Expert-only agent tools** (powerful, narrow audience):
- **Cursor SDK / Claude Code / Hermes / OpenClaw CLI** -- Excellent for terminal experts. But they require SSH, MCP configs, manual process management. No visual interface. No templates. No observation. And critically: no programmatic MCP for agent-to-agent coordination. They're single-agent tools, not fleet orchestrators.

**What I understand that they don't:**

1. **The primitive is agent+container, not container alone.** Everyone in the Bay is building containers OR agents OR memory as separate products. The thing people actually want is the combined unit: a persistent agent with skills, services, memory, and scheduling, ready to work.

2. **Distribution wins on imagination, not specs.** It's hard to imagine what you can do with a bare sandbox -- the use case is abstract. But a persistent agent that runs security audits, deploys your code, monitors your services, and gets smarter every week? People get it immediately. We win on distribution because the product explains itself. Competitors sell infrastructure. I sell the outcome.

3. **Observation beats the black box.** I discovered this building the tool: you can't orchestrate what you can't see. Because we're simultaneously low-level (real VMs, real tool calls) and high-level (visual dashboard, templates), we give actual observability instead of a black box. Competitors skip to "run code" without showing what's happening, which is why they stay expert-only.

4. **The programmatic surface is the real moat.** A dashboard for humans is table stakes. An MCP server that lets agents provision and coordinate other agents is the endgame -- API-based with a CLI exposer. If the platform is callable by agents, not just humans, growth becomes recursive. No competitor is building this.

### How do or will you make money? How much could you make?

**Revenue model**: Platform fee + compute margin (we mark up substrate costs like Vercel marks up AWS).

**Tiers**:
- Free: 1 machine, 10 compute-hours/mo, community skill library
- Pro ($29/mo): 5 machines, unlimited compute, full skill library, cron scheduling, priority routing
- Team ($99/seat/mo): Fleet management, shared skill libraries, audit logs, SSO, team governance
- Enterprise (custom): Self-hosted option, compliance layer, private skill registries, SLA

**Why this grows fast**: Every skill an agent learns generates more autonomous work (cron jobs, scheduled audits, automated deploys). More autonomous work = more compute hours = more revenue. Usage compounds without the developer doing anything. This is the AWS flywheel: the more you use it, the more you need it.

**TAM**: Agent infrastructure market projected $47B+ by 2028 (44% CAGR). Control planes in adjacent markets capture 10-30% of total spend (Kubernetes ecosystem is ~$7B of $65B container market). If agent compute reaches $47B, the control plane layer is $5-15B.

**Near-term**: 100K developers × $29/mo = $35M ARR. Plausible within 3 years given 57% of teams already run agents and have no management layer.

**Expansion**: The skill marketplace takes a cut of premium skill sales (like Shopify themes). Enterprise governance is high-margin SaaS. Substrate cost optimization (routing to cheapest provider) creates a Cloudflare-style margin expansion over time.

### Other ideas considered

1. **Self-evolving agent skills / automation** (standalone) -- Publishing and monetizing SKILL.md files that self-update using research agents with browser use, scraping signals from RSS feeds, blogs, Twitter trending, etc. Most published skills (e.g. on Skills.sh) are useless. All the actual skills I use come from building proper frameworks for my agents -- and even then they fall out of date with the pace of R&D in SF. I've built the solution at https://loooop.dev/ -- self-evolving skills on a public community marketplace with an execution runtime to see skills at work.
2. **AI-native CI/CD** -- Agent-driven pipelines replacing GitHub Actions. The combined primitive subsumes this: cron + skills + substrate management IS CI/CD for agents.
3. **Agent-to-agent protocol** (standalone) -- A networking standard for agents. Too early as a spec. But the Agent Machines MCP server IS this protocol in practice -- the programmatic surface for agents to provision and coordinate other agents. Shipping it as infrastructure rather than a standard is the right path.

---

## Moat & Future Plans

### Why the combined primitive is defensible (and bare VMs aren't)

Containers are commodity. Anyone can spin up a microVM. But the combined "persistent agent" unit -- with skills, services, observation, and scheduling -- is not. And the programmatic MCP surface that lets agents orchestrate other agents? That's where lock-in compounds.

1. **Intelligence lock-in via the skill protocol.** SKILL.md is a structured format for agent-learned procedures. Every complex task becomes a reusable skill. After 6 months: hundreds of procedures customized to your stack, conventions, services. Not portable to ChatGPT, Claude, or any single-vendor agent. Switching costs grow with every session.

2. **The skill graph has network effects.** 155 skills ship today. As the community grows, the shared library grows. New users in 2027 start with 1000+ battle-tested procedures. This is npm for agent intelligence -- the registry gets more valuable with every contributor.

3. **Substrate abstraction accrues value at our layer.** We make container providers interchangeable. Today Dedalus, E2B, and Sprites.dev. Tomorrow more. The combined primitive deploys identically on any substrate. The value stays in our layer regardless of where the bits run.

4. **The programmatic surface creates recursive growth.** When a head agent can provision worker agents via MCP, every agent machine is both a consumer and a creator of demand. Growth becomes self-reinforcing -- agents scale the platform faster than humans alone ever could.

### Future roadmap

**Q3 2026 -- Multi-substrate + billing + marketplace**:
- Additional substrate providers beyond Dedalus, E2B, and Sprites.dev
- Usage-based billing: pay per active compute-hour, store-only when sleeping
- Skill marketplace: publish, install, rate, version community skills

**Q4 2026 -- The programmatic layer (the big unlock)**:
- **Agent Machines MCP server**: an MCP tool that any agent can call to provision, wake, sleep, destroy, and chat with other agent machines. This turns every existing agent (Claude, Cursor, OpenClaw, custom) into an orchestrator of our platform.
- **Agent Machines CLI**: same operations from any terminal or CI pipeline -- `am provision --template code-review`, `am fleet create`, `am route task`
- Head-agent pattern: one orchestrator agent manages a fleet of specialized workers, routing tasks by capability, observing results, scaling up/down

**2027 -- Self-scaling agent fleets**:
- Team/org fleet management with shared skill libraries and governance
- Agent-to-agent task routing: specialized machines advertise capabilities, head agents discover and delegate
- Substrate cost optimizer: head agent routes workloads to cheapest provider automatically
- Enterprise compliance: audit trails, budget limits, model allowlists, data boundaries
- Self-hosting: run the full stack on your own infrastructure

### Why this scales -- three phases

**Phase 1 (now): Humans deploy agents through the interface.**
Visual dashboard, templates, insertion layers. Makes persistent agents accessible to non-experts. This is the ChatGPT moment for cloud, persistent agents.

**Phase 2 (Q4 2026): Agents deploy agents through MCP/CLI.**
The same platform, but the user is an agent, not a human. A head agent calls `agent-machines/provision` via MCP, spins up three workers, routes a complex task across them, observes results, tears down idle machines. The interface becomes an API. The platform becomes self-scaling.

**Phase 3 (2027): Agent fleets as a service.**
Organizations run fleets of specialized agents -- code review, research, ops, compliance -- all managed through our control plane. Head agents orchestrate. Humans set policies and observe. The platform is the nervous system.

### The endgame

```
Human or Head Agent
        ↓
Agent Machines (dashboard / MCP server / CLI)
        ↓                    ↓                    ↓
  Provision & Observe    Route & Schedule     Skill Registry
        ↓                    ↓                    ↓
  [persistent agent machines on any substrate]
        ↓
  Dedalus | Fly | Vercel | self-hosted | future
```

The critical insight: when agents can programmatically provision and coordinate other agents through our MCP, the platform self-scales. Every agent machine is both a worker AND a potential orchestrator. Growth becomes recursive -- agents create demand for more agents.

Flywheels:
- Every new substrate → more routing options, better pricing
- Every new skill → better templates, faster onboarding, more capable agents
- Every new user (human OR agent) → more operational data, more community skills
- Every head agent that orchestrates → creates demand for N more worker machines

---

## Founder Video Script (60 seconds)

```
[0:00 - 0:08]
"Hey, I'm Kevin Liu. I'm 19, a Princeton sophomore, one of two in my 
class graduating early. 2026 in SF, not campus. Ex-Bloomberg, ex-AWS. 
Building agentic infra at Dedalus Labs."

[0:08 - 0:22]
"I can't wait for other people to solve my problems. I put myself in 
front of the hardest problems I can find and stay until I solve them -- 
induced challenge. I learn through curiosity, not a set path through 
academics. First proof: I cofounded the largest online math competition 
for high schoolers. 35K raised, 8,000 users, scaling under attack -- 
a perceived limiter until it wasn't."

[0:22 - 0:38]
"At AWS I built my first agent harness. That led to Sevenfold. We 
applied to YC. You told us to figure out if we were ready. I wasn't. 
Six months forward-deployed at Dedalus. The lesson: the best software 
loses to software people can actually understand and adopt."

[0:38 - 0:50]
"Agent Machines is that interface. Persistent agents that audit your 
code, deploy your app, monitor your endpoints, and get smarter every 
week without shutting down. One click. Any substrate."

[0:50 - 1:00]
"Two cofounders from MIT and Columbia ready to drop out. Not a slide 
deck -- something live. Thank you for your time."
```

---

## Demo Video Script (3 minutes)

```
[0:00 - 0:12] Cold open. No preamble.
Screen: agent-machines.dev/dashboard/setup.
Pick template: "Full-stack dev agent." Pick substrate: Dedalus.
Click Provision. Timer starts. Machine boots. 30 seconds.
"That's a persistent agent with 155 skills, 17 MCP services, 10 CLIs, 
15 built-in tools, browser automation, cron, and a Cursor bridge. 
One click."

[0:12 - 0:35] Observation. The thing that makes this different.
Chat: "Run a security audit on this repo."
Agent starts working. Dashboard shows everything live: which skill 
loaded (deepsec), each tool call as it happens (browser open, terminal 
exec, file read), tokens consumed, cost in real-time.
"This is not a black box. You see every decision. Every tool call. 
Every dollar spent. I built this observation layer first, to benchmark 
agents across container providers. Turns out watching agents work is 
the feature people actually want."

[0:35 - 0:55] Skill protocol. Show the novel thing.
Agent finishes the audit. Results are structured.
Chat: "Save this audit pattern as a skill."
Agent writes a SKILL.md. Show the file: structured, versioned, clear.
Skills browser: 156 skills now. One more than five minutes ago.
"Every complex task compounds into a reusable procedure. This is the 
core invention. After six months you have hundreds of custom skills. 
You can't move those to ChatGPT. That's the lock-in."

[0:55 - 1:15] Insertion layers. Show customization is real.
Skills browser: click "Add skill." Paste a custom SKILL.md. Live.
MCP panel: Vercel, Stripe, Supabase connected. Click "Add service."
Configure Datadog in 10 seconds.
"155 skills, 17 MCP services, 10 CLIs, 15 built-in tools out of the 
box. But everything is an insertion point. Your skills. Your services. 
Your CLIs. Your governance."

[1:15 - 1:40] Cron. Agents that work at 3am.
Cron panel: four automations running.
Pull up the most recent cron execution log. Agent woke the machine 
from sleep at 3:12am, ran a health check, found a broken API endpoint, 
opened a GitHub issue with reproduction steps, machine went back to 
sleep. Total cost: $0.04.
"Nobody prompted this agent. It ran on schedule, found a real bug, 
filed a real issue, and went back to sleep."

[1:40 - 2:05] Fleet. Multiple machines, specialized agents.
Machines panel: three machines running.
  - code-review: 47 skills, connected to GitHub + Linear
  - research: 31 skills, connected to browser + web search
  - ops: 22 skills, connected to Vercel + Datadog + Slack
Switch active machine. Each has its own session history, skill set,
cron schedule. Different substrates shown.
"Nobody wants one agent that does everything. You want specialized 
agents with their own skills and services. The dashboard manages the 
fleet. The container underneath is an implementation detail."

[2:05 - 2:35] The endgame. Agents provisioning agents.
Switch to terminal view. A head agent is running.
Head agent: "I need a code review agent and a staging deploy agent. 
Provision both, route this PR through code review first, then deploy 
if it passes."
Dashboard: two new machines appear. Status goes from provisioning to 
running. Code review agent processes the PR. Passes. Deploy agent 
picks it up. Deploys to staging. Results flow back to the head agent.
Both machines sleep.
"This is where it goes. An MCP server so agents provision and 
coordinate other agents. The platform becomes self-scaling. Agents 
create demand for more agents."

[2:35 - 3:00] Pull back to the full dashboard.
All five machines visible. Skill counts ticking. Sessions streaming.
Cron jobs scheduled. Cost dashboard showing spend by machine.
"Persistent agents as a one-click primitive.
155 skills. 17 MCP services. 10 CLIs. Any substrate.
For humans today. For agents tomorrow.
agent-machines.dev."
```

---

## Additional Application Fields

### Who writes code on your product?
Me. All technical work so far -- CLI, web dashboard, website, skill protocol/tool router, MCP integrations, substrate provider abstraction, infrastructure routing, deployment, gateway protocol, terminal environments, and agent runtimes.

### Are you looking for a cofounder?
Yes. I have two people I'd cofound with in a heartbeat -- one from MIT, one from Columbia -- both willing to drop out. We're in active conversations. Ideal profile: distributed systems / orchestration background (Kubernetes, Nomad, Terraform, cloud infrastructure). The product works today for individual developers; a cofounder helps make it work for fleets of thousands of agents.

### Applied before / pivot?
Yes. Applied previously with a different idea and cofounder (Athan Zhang). YC told us to figure out whether we wanted to drop out. We split -- Athan founded Copperlane, which is in the current Spring batch. I stayed in SF and went forward-deployed at Dedalus Labs to learn how startups actually work from the inside.

Different idea, different cofounder, different company. Agent Machines emerged from 6 months of operating at Dedalus -- dogfooding containers, building agent harnesses, learning distribution. The previous application was the push I needed to get serious. This time I'm applying with a live product, used internally, open source, and the conviction that comes from shipping.

### Incubator/accelerator participation?
[Fill if applicable]

### What convinced you to apply to YC?
Last time I applied, YC told me to figure out whether I wanted to drop out. My cofounder went on to found Copperlane in the Spring batch. I stayed in SF, went forward-deployed at Dedalus, and spent six months learning how to actually build and ship. I came back with a live product, three substrate providers, 155 skills, and the conviction that persistent agents are the primitive the industry is missing.

YC's Summer 2026 RFS calls out "Software for Agents" and "Dynamic Software Interfaces." Agent Machines is both. The timing is right: substrates just got cheap enough for persistent agents to be economically viable, frameworks stabilized, and the interface layer is wide open. Nobody has built the accessible way to deploy, observe, and control persistent agents. That's the gap.

I'm also not just pitching an idea. I've been building in this exact space for six months at one of the infrastructure companies that powers agent compute. I know the substrate economics, the developer pain points, and the distribution challenges from the inside. Agent Machines already works. What I need from YC is the network to distribute it and the velocity to capture this window before the big platforms close it.

### How did you hear about YC?
[Your answer]

### Have you formed a legal entity?
[Your answer]

### Have you taken investment?
[Your answer]

### Are you currently fundraising?
[Your answer]
