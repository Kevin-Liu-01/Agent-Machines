# Agent Machines

> Open-source building blocks for agent harnesses.

Choose a runtime. Connect tools, state, and compute. Start from a working
implementation you can inspect, edit, and extend.

Agent runtimes are powerful; assembling the surrounding system is still hard.
Agent Machines brings together **Claude Code, Codex, Hermes, and OpenClaw**,
sandbox adapters, bootstrap recipes, a real browser terminal, configuration,
skills, and a dashboard for operating multiple agents.

Think **shadcn for agent harnesses**: useful source you can adopt and make your
own. This is an analogy for the source-first approach, not a claim of a shadcn
registry, a component-install CLI, or a public marketplace.

[Explore the building blocks](https://agent-machines.dev/components) ·
[Open Agent Machines](https://agent-machines.dev) ·
[Browse the source](https://github.com/Kevin-Liu-01/Agent-Machines) ·
[Read the architecture](docs/WHITEPAPER.md)

## What you get

| Building block | What you can use | Source |
|---|---|---|
| Runtime adapters | Install and run Claude Code, Codex, Hermes, or OpenClaw through a shared boundary | [Runtime adapters](src/mux/harnesses), [contracts](src/mux/types.ts) |
| Compute adapters | Provision, execute, inspect, and tear down machines on Daytona, E2B, Sprites, or Vercel Sandbox | [Provider adapters](src/mux/providers) |
| Bootstrap and configuration | Prepare a workspace, configure a compatible model route, and apply runtime-specific setup | [Bootstrap runner](web/lib/bootstrap/runner.ts), [mux configuration](src/mux/config.ts) |
| Browser Agent Console | Interact with the real agent CLI and reconnect to its remote terminal session | [Console UI](web/components/dashboard/InteractiveConsole.tsx), [session layer](web/lib/dashboard/terminal-session.ts) |
| Instructions, memory, and abilities | Bring your own persona and instructions, select skills and tools, and edit the underlying files | [Memory bundles](web/lib/memory), [skills](knowledge/skills), [MCP catalog](knowledge/mcps) |
| Lifecycle and multiple-agent dashboard | Manage configured workspaces, launch operations, schedules, files, logs, and results | [Lifecycle kernel](src/control-plane), [dashboard](web/app/dashboard) |
| SDK and CLI | Use the hosted app from code or talk directly to your sandbox providers | [Public exports](src/index.ts), [CLI](src/cli.ts) |

The bundled catalog contains **161 skills and 39 MCP servers**. Catalog entries
and selected abilities are not proof of installation, credentials, or successful
runtime use. The dashboard separates discovery, installation attempts, and
verification; some integrations need manual setup.

## Start with the app

Requires Node `^20.19` or `>=22.12` and pnpm 10.30.0.

```bash
git clone https://github.com/Kevin-Liu-01/Agent-Machines.git
cd Agent-Machines
corepack enable
pnpm install --frozen-lockfile
cp web/.env.local.example web/.env.local
pnpm web
```

Open [the local dashboard](http://localhost:3210/dashboard). The example enables
a local-only development session when Clerk keys are blank. On an existing
checkout, preserve your environment file instead of copying over it.

1. Configure a sandbox credential and a compatible model credential in Settings.
2. Choose a runtime and provider, or start from a preconfigured agent recipe.
3. Launch, watch bootstrap, and open the real CLI in the browser.
4. Run a small task, inspect its files and logs, then edit the instructions or
   loadout and try again.

A local preview does not prove hosted authentication. Hosted deployments require
Clerk and Supabase configuration, database migrations, and a scheduler secret for
cron dispatch. See the [web operator guide](web/README.md) and
[release procedure](docs/LAUNCH.md). Provider and model usage may incur charges.

## Adopt the pieces in your own code

The package exposes three distinct surfaces. Choose the smallest one you need;
the dashboard is not required for direct provider use.

| Surface | Public entry | Use when |
|---|---|---|
| Direct multiplexer | `createMux` from `agent-machines/mux` | You want runtime and compute adapters with your own provider keys |
| Lifecycle kernel | `AgentMachinesControlPlane` from `agent-machines/control-plane` | You need desired state, durable operations, reconciliation, and recovery |
| Hosted client | `AgentMachines` from `agent-machines` | You want to launch and run through a configured Agent Machines deployment |

These are real package exports. The source modules are available to study,
adapt, or extend under MIT; they are not all independently packaged components.

### Direct SDK: launch and stream a run

From this checkout, run `pnpm build:sdk` before importing the package.
For the example below, supply `E2B_API_KEY` and `ANTHROPIC_API_KEY` in the
process environment. No Agent Machines account or hosted API is required.

```ts
import { createMux } from "agent-machines/mux";

const mux = createMux();
const machine = await mux.create({
  name: "harness-example",
  agent: "claude-code",
  sandbox: "e2b",
});

try {
  const run = machine.run("Run pwd and list the files in the working directory.");
  for await (const event of run) {
    if (event.type === "text") process.stdout.write(event.delta);
  }
  const result = await run.result();
  if (result.exitCode !== 0 || result.truncated) {
    throw new Error("The agent run did not complete successfully.");
  }
} finally {
  await machine.destroy(); // This disposable example deletes its sandbox.
}
```

For a lasting workspace, retain the named machine and manage its lifecycle
explicitly. `createMux` accepts an inline configuration object or a path to a
configuration file; it also discovers `agent-machines.json` or `am.config.json`.
Use environment references rather than committing secrets:

```json
{
  "keys": { "anthropic": "env:ANTHROPIC_API_KEY" },
  "providers": {
    "e2b": "env:E2B_API_KEY",
    "sprites": "env:SPRITES_TOKEN"
  },
  "sandboxes": { "primary": "e2b", "backups": ["sprites"] },
  "agents": { "default": "claude-code" }
}
```

Automatic placement, capability constraints, migration, run idempotency, and
trace-based ordering are documented in [the mux reference](docs/MUX.md).
Placement failover does not replay a run that fails midway. The direct mux's
routing features are not all exposed by the hosted dashboard.

### Lifecycle kernel: keep configured intent

```ts
import { createMux } from "agent-machines/mux";
import {
  AgentMachinesControlPlane,
  JsonFileControlPlaneStore,
  MuxWorkerRuntimeDriver,
} from "agent-machines/control-plane";

const plane = new AgentMachinesControlPlane(
  new JsonFileControlPlaneStore(".agent-machines/control-plane.json"),
  new MuxWorkerRuntimeDriver(createMux()),
);

await plane.apply({
  id: "repo-coder",
  spec: {
    name: "Repo coder",
    runtime: "claude-code",
    sandbox: "e2b",
    schedules: [],
  },
});
await plane.drain();
```

This provisions a retained workspace using your credentials. The library records
operations before provider work and reconciles desired state. Your application
must invoke the reconciler to make progress; importing it does not start a
background service. The hosted app supplies its own recovery and scheduled
consumer. Its Memory, loadout, and profile handling is not included in the
default public mux driver. See [control-plane boundaries](docs/CONTROL-PLANE-V2.md).

### Hosted SDK: use your deployment

Create a user-scoped key in **Dashboard → Settings → Developer API**. Set
`AGENT_MACHINES_API_KEY` privately and `AGENT_MACHINES_URL` to your deployment.
The production API origin is `https://www.agent-machines.dev`; target it directly
so credentials do not depend on a cross-origin redirect.

```ts
import { AgentMachines } from "agent-machines";

const am = new AgentMachines();
const agent = await am.create({ agent: "codex", sandbox: "e2b" });
const result = await agent.run("Create hello.txt containing hello from my harness.");
console.log(result.text);
```

The account needs its own sandbox and compatible model credentials. This creates
a retained Worker; inspect and stop or delete it in the dashboard when finished.
`create()` waits for launch completion; `run()` waits for the completed result.
The default deadline is five minutes. Aborting or timing out stops the local
wait, not server work already accepted. Inspect operation history before
submitting again. See [SDK source](src/lib/sdk.ts) for call options.

### CLI

Read-only exploration works without creating a sandbox:

```bash
pnpm mux routes
pnpm mux health
pnpm mux stats --since 24h
```

With provider and model credentials configured:

```bash
pnpm mux term --agent codex --name coder
pnpm mux shell --name coder
pnpm mux ls
pnpm mux rm --name coder
```

The last command destroys the named sandbox. Commands are repository scripts;
there is no claim of a published component-install CLI.

## Bring your own harness

Start with the supplied setup, then change the pieces that matter to your work:

- **Configuration:** choose compatible model credentials, runtime, provider,
  resources, and environment through the supported settings or SDK fields.
- **Instructions and memory:** edit a Memory bundle or import pasted documents.
  Runtime adapters install those documents into the files the runtime reads.
- **Skills and tools:** use bundled procedures, add your own files, or discover
  integrations in the dashboard registry. Review commands and grant credentials
  explicitly; a selected loadout alone does not install or verify a tool.
- **Implementation:** extend an adapter, change a bootstrap recipe, or build on
  the lifecycle and terminal modules. The source and contracts stay inspectable.

Memory export is a Markdown document with instructions and ability labels, not
a complete executable harness export. Bundled knowledge refresh preserves
Worker-authored memory and modified skills. Browser tooling is a best-effort
bootstrap phase; launching an agent does not prove every optional tool is ready.

## A Worker is the configured workspace

The dashboard calls a configured agent workspace a **Worker**. It connects the
runtime, model route, instructions, memory bundle, abilities, schedules, files,
and lifecycle history. This keeps setup useful across browser reconnects and
supported lifecycle changes.

That lasting state is an architectural enabler, not a promise of autonomous
labor or unlimited uptime. Persistence depends on the provider and the state
being managed. Migration moves allowlisted durable state and restarts processes;
it does not move RAM or every native runtime session.

## Provider support and limits

Four provider adapters are implemented. They do not offer identical behavior,
and four runtimes × four providers is not a claim of a freshly verified matrix.

| Provider | Persistence and lifecycle boundary |
|---|---|
| Daytona | Explicit stop/start retains the filesystem; processes and RAM are not restored |
| E2B | Manual pause/resume is supported; resource allocation is template-defined |
| Sprites | Provider-managed idle suspension; no manual Sleep operation |
| Vercel Sandbox | Filesystem snapshot/restore; running processes and RAM are not restored |

Runtime capacity and model compatibility also matter. The hosted app uses
native Anthropic for Claude Code and native OpenAI for Codex, with supported
gateway paths for Hermes/OpenClaw. The direct mux has a different mapping:
Claude Code, Codex, and OpenClaw accept supported gateways, while its Hermes
adapter is native-only. See [upstream details](docs/UPSTREAMS.md),
[the current mux mapping](src/mux/upstreams.ts), and
[adapter capabilities](docs/MUX.md).

The September 9 reports include a real new-account **Codex on Daytona** run
through completed work and artifact read-back. The August 5 strict matrix is
historical, includes a retired provider, and is not Daytona validation.
[Launch evidence and exact scope](docs/LAUNCH.md) distinguish source support,
local tests, and deployed proof. No new live provider test is implied by this
documentation update.

## What is still direction

Natural-language harness creation, a public Worker marketplace, autonomous
delegation with scoped authority, and unified provider billing are future
directions. Today you configure and operate the supplied modules, use
preconfigured recipes, and bring your own provider accounts.

The dashboard's tool-discovery registry is not a public marketplace for complete
harnesses. A recipe is a starting configuration, not a verified specialist or a
guarantee of task success.

## Development and verification

```bash
pnpm test
pnpm typecheck
pnpm --dir web typecheck
pnpm build
pnpm verify:sdk
pnpm check
```

These local checks make no billable provider or model calls. The web scripts
compile the SDK first; builds prepare data from committed knowledge sources,
without refreshing external catalogs. `verify:sdk` packs and exercises the real
ESM/CommonJS entry points in an isolated consumer.

A hosted release additionally needs the [new-account verification flow](docs/LAUNCH.md).
Do not substitute a local preview or old benchmark for deployed evidence.

## Documentation

- [Product messaging and claim ledger](docs/PRODUCT-MESSAGING.md)
- [Architecture whitepaper](docs/WHITEPAPER.md)
- [Current roadmap and historical engineering record](docs/ROADMAP.md)
- [Direct mux reference](docs/MUX.md) and [dated measurements](docs/MUX-RESULTS.md)
- [Lifecycle kernel](docs/CONTROL-PLANE-V2.md)
- [Browser terminal architecture](knowledge/BROWSER-AGENT-CONSOLE.md)
- [Web documentation index](web/docs/README.md) and [operator guide](web/README.md)

## License

[MIT](LICENSE). Provider accounts, credentials, and applicable service charges
remain yours.
