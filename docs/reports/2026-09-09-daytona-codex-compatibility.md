# Daytona Codex CLI: parser compatibility

On September 9, 2026, read-only checks inspected the preinstalled Codex CLI on
the authorized migrated QA sandbox `e83e6f53-f98d-45af-acd4-7ce04498fa55`.
The executable was `/usr/local/share/nvm/current/bin/codex`, reporting
**`codex-cli 0.128.0`**. No installation, authentication write, configuration write,
session execution, or model request was performed.

## Actual CLI evidence

At 10:29:43 UTC, the installed CLI's help advertised the managed first-run flags:
`--json`, `--skip-git-repo-check`,
`--dangerously-bypass-approvals-and-sandbox`, `--model`, `--cd`, and `--config`.
Its login help also advertised `--with-api-key`.

Resume supports the other managed flags, but not `--cd` after its subcommand.
The existing harness appended `-C <workspace>` after `exec resume`, which failed
even in a help-only parser check:

- `codex exec resume ... -C /home/daytona/agent-machines --help` returned exit
  code **2**, reporting an unexpected `-C` argument.
- `codex -C /home/daytona/agent-machines exec resume ... --help` returned exit
  code **0**.

The correction moves the workspace option before `exec`/`exec resume` while
preserving prompt encoding, quoted paths, selected model, session ID, other
flags, and credential delivery through environment variables. OpenAI documents
`exec` and its optional `resume` subcommand as distinct command surfaces; the
installed binary's parser is the compatibility evidence for this version.
See the [official command reference](https://learn.chatgpt.com/docs/developer-commands#codex-exec).

## Regression and independent recheck

The Tests skill guided an executable shell-boundary regression rather than only
a string-format assertion. Two cases exercise fresh and resumed commands with a
quoted workspace containing shell metacharacters, a multiline prompt, a quoted
session ID, and fake credentials kept out of argv. The resumed case failed
before the fix; the fresh-run control passed. After the fix, **33/33 Codex tests**,
the root TypeScript check, and diff checking passed.

At **10:32:18 UTC**, both fresh and resumed commands emitted directly by the
updated source harness were executed against the actual installed CLI with
`--help`. Both returned help, exit code zero, and empty stderr. The dummy auth
environment returned by the harness was deliberately not passed to the sandbox.

This proves argument parsing, not successful paid Codex execution, model access,
JSON-event compatibility, or resuming a real prior session. Those claims require
separate runtime evidence.

Private local evidence: `daytona-codex-readonly-probe.json`,
`daytona-codex-emitted-probe.json`, `codex-cwd-red.log`, and
`codex-cwd-green.log` under `/tmp/agent-machines-launch-20260909/`.
