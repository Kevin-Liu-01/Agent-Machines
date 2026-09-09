# Managed workspace artifact capture — September 9, 2026

## Behavior

Hosted managed runs take a bounded baseline of `~/agent-machines` and `~/work`, then collect new or changed files after the actual runtime command. They do not scan all of HOME. Each captured file receives a separate immutable application-level snapshot under `~/.agent-machines/artifacts/run-<hash>/`, with metadata recording the original source path, run key, byte count, MIME type, and SHA-256. Metadata is published only after the copied content exists. Later source edits do not change that copy.

The collector returns warnings alongside the real runtime result. Collection failure or incomplete coverage does not retry paid work, convert a failed agent execution to success, or erase the agent's successful response. Partial files can still be collected following a runtime failure. The operation journal and Console can retain those warnings.

This is a bounded managed-run capture, not a claim to capture every unmanaged terminal edit. Direct exports in `~/.agent-machines/artifacts` are handled by the separate artifact inventory.

Managed harness commands now explicitly run in `~/agent-machines`, creating that quoted workspace path when absent. Relative output files therefore share the same durable workspace and capture scope as terminal work.

## Safety and limits

- Linux directory descriptors anchor every path component. Source reads use `O_NOFOLLOW` and `O_NONBLOCK`, verify a regular non-hardlinked file, and retain the bounded bytes already read rather than reopening an absolute path.
- Destination files are created with exclusive writes through a pinned directory descriptor; the final directory identity is checked before reporting a successful capture.
- Hidden files, dependency/build directories, credential-like names, private-key formats, symlinks, and hardlinked files are excluded.
- Defaults: 1,000 files, 5,000 directory entries, 12 levels, 4 MiB per file, 32 MiB of scanned content, and a five-second guest scan budget. Each provider call is also bounded. Exceeding limits produces visible incomplete-collection warnings.
- An incomplete baseline cannot safely attribute previously unseen files, so it captures only changed files that the baseline actually observed.
- Expired request deadlines never start another capture exec. The runtime deadline is checked before the baseline and recomputed afterward. Non-Linux systems fail closed with an explicit warning because the descriptor primitive used here is Linux-specific.

## Executable evidence

The checked-in portable fixture executes the exact production script, not a mocked filesystem. On the isolated E2B QA machine `inhhzbntovc0yik89pe4f`, all eight checks passed:

1. New/changed output capture, provenance, immutable copies, and unchanged-file exclusion.
2. Credential, hidden-file, dependency, symlink, and hardlink exclusions.
3. Per-file limit without silently truncating content.
4. Incomplete baseline attribution safety.
5. Symlinked destination refusal.
6. Symlinked workspace refusal and no broad HOME scan.
7. A deterministic parent-directory swap immediately before a source read cannot redirect it to a secret file.
8. A deterministic parent-directory swap immediately before a destination write leaves the substituted outside directory untouched and reports collection failure.

The fixture creates and removes only its own `mkdtemp` directories; it does not change real workspace files or create additional model runs. The hosted exec UI's 4,000-character cap was respected; the long executable fixture was run through the authorized E2B SDK on the same disposable machine.

Local validation: 71 focused cron/driver/capture tests passed, with seven Linux-only filesystem checks explicitly skipped on macOS; the provider run above supplies their real Linux evidence. Web TypeScript and `git diff --check` passed. The full managed-runtime artifact-list/download UI remains a post-deployment check, distinct from these source and provider-fixture results.
