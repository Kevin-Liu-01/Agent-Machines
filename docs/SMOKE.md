# Explicit-fixture runtime smoke check

Use `pnpm check` for the offline release gate. It creates no sandbox and calls no
model. The separate `smoke:agents` command verifies one real managed response;
it is potentially billable and does not replace the [launch checklist](LAUNCH.md).

Prepare an explicitly authorized disposable Worker through the dashboard, with
its intended runtime/model and credentials. Confirm it is already running and
bootstrapped. Record its exact machine ID. For hosted access, set that account's
`AGENT_MACHINES_API_KEY` privately in the process environment; do not put a key in
the command line or report.

From the repository root:

```bash
pnpm build:sdk
pnpm --dir web smoke:agents --help
pnpm --dir web smoke:agents --base-url https://www.agent-machines.dev --machine-id <exact-id> --agent codex --allow-paid-run
```

The supported runtimes are `hermes`, `openclaw`, `claude-code`, and `codex`. The
explicit URL can instead be `http://127.0.0.1:3210` for the existing local dev
session. Hosted URLs require HTTPS and an account API key. Use the canonical
origin directly; redirects are rejected, so `.com` is not a hosted SDK target.

The command checks only that exact machine, refuses archived, sleeping,
unbootstrapped, or runtime-mismatched fixtures, and submits one managed task
through the public SDK. It never lists/selects a fleet, creates or wakes a
machine, repairs a runtime, switches configuration, or deletes anything. A
completed run must return the fresh exact response marker to pass; a CLI version
string, installed executable, or accepted operation is not execution proof.
This proves a model response, not tool execution, files, lifecycle persistence,
all provider/runtime combinations, or production signup. The task asks not to
use tools or change files, but this is an instruction, not filesystem isolation;
normal runtime/session/journal writes can still occur.

One invocation permits one potentially billable managed run. HTTP redirects and
ambiguous responses fail closed. The client waits at most 90 seconds for the run,
after a bounded inspection; a client timeout is not remote cancellation. Inspect
the Worker's operation journal before another invocation. There is no automatic
retry or cleanup: explicitly stop or delete only the approved fixture after
verification, and record any retained disk and potential storage charges.

`scripts/verify-agent-provider-matrix.sh` is a non-mutating deprecation entry
point and exits 2. Its old gateway assumptions, opportunistic fleet selection,
automatic reprovisioning, and version-only passes are not a valid release gate.
Use the explicit command once per approved fixture, not an automatic paid matrix.

Offline command-boundary regressions run with the real CLI and packaged SDK,
replacing HTTP with deterministic fixtures:

```bash
pnpm --dir web exec vitest run lib/scripts/smoke-agent-runtimes.test.ts
```

The web suite includes these tests through `pnpm check`.
