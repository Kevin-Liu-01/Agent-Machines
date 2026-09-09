#!/usr/bin/env bash
# Retained only to make old automation fail explicitly, without touching a fleet.
printf '%s\n' \
  'Retired: the legacy matrix used obsolete gateway commands and could create or wake unintended machines.' \
  'Offline release gate: pnpm check' \
  'Explicit-fixture managed execution: pnpm --dir web smoke:agents --help' \
  'See docs/SMOKE.md and docs/LAUNCH.md. This entry point performed no checks or mutations.' >&2
exit 2
