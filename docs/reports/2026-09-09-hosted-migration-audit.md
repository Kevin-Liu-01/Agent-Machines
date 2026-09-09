# Hosted E2B → Sprites portability audit — September 9, 2026

## Scope

A newly signed-up QA account created durable Worker `479cf04a-d0ee-4fde-9237-e0aeead11810` on E2B `iwyefxwwmug0kcv8knxr0`. Its first real native Claude Code task produced `~/agent-machines/release-proof.txt`. The hosted UI then migrated it to Sprites `am-mux-coding-agent-d11810-mttt57h941`, with state transfer enabled, live mode selected, and the source explicitly kept.

The UI reported migration from `07:59:28.286Z` to `08:01:17.361Z` (about 109 seconds), transferring 3,975,211 bytes: a 3,974,891-byte baseline plus a 320-byte final delta. It reported zero active managed runs, a completed drain, one stability pass, a released migration gate, and a recorded Worker-ID placement. A legacy name-keyed placement was not written because keeping both machines produced two identical labels; Worker identity, not that ambiguous label, identified the destination.

The flow began after release `520a853199560a6a18d696624a6c7322814392da`; deployment of `a1a976a` completed during migration startup. These observations do not establish that every request ran on one immutable release.

## Independent byte and state checks

At `08:03:54–55Z`, a separate provider-backed inspection compared both machines with a pre-migration source baseline. It made no model call, explicit lifecycle change, or cleanup operation.

- The original 31-byte release proof matched SHA-256 `71d7083bff44fe246cedfe2171b7970ca64113ca502683903d0a5f8f9367836d` at the destination's correct `/home/sprite/agent-machines` path.
- The isolated `~/work/launch-migration-proof` repository kept commit `23b049ee6a7c342dfbf37edb05eee8768aafc771`, branch `main`, Git index contents, working-tree contents, and exact status: `A  staged-only.txt`, `MM tracked.txt`, and `?? untracked-output.txt`. All five included fixture-file hashes matched. Its ignored `node_modules/ignored-dependency/index.js` was absent at the destination and remained present at the source.
- Canonical `MEMORY.md` remained exactly 3,808 bytes, SHA-256 `fb002c7227dd675bfc51b33de76c8389166e3169d6e3be070e0b798f53cd8a12`. The other three canonical memory files also matched. Preparation had only appended an explicitly approved 251-byte QA stanza, retaining all prior memory bytes.
- Both destination Claude entrypoints, `~/.claude/CLAUDE.md` and `~/CLAUDE.md`, were regenerated from canonical memory. Both now contained the unique marker `AM-CANONICAL-MIGRATION-PROOF-520a853-20260909`, which their source counterparts did not yet contain. Their identical destination hash was `57ec643159c8411d27841395a27c08f7ca86a0adfdc0f4cba83653b088dabb9c`.
- Original native Claude session `39e24563-325d-4d9b-9dc0-d426d1c60b54` remained exactly 11,520 bytes, SHA-256 `2a248ee6a0a716046a9a74add23b956d4cf0d6647f923b142c5b418ff7da2505`. It retained its original source-encoded project directory. File preservation alone is not proof that a runtime can resume that session from a different HOME.
- Durable model selection and hosted settings still specified `claude-sonnet-4-6` and `claude-code`.
- Captured artifact `run-6b9888f491da9d7f2921461d66502c6a` retained the exact 31-byte proof and metadata hash `41cf9eb72531e962f8079e6b6a7f68d1fff15a6c87956c9e66de6c770017fc66`. Its provenance correctly kept the original `/home/user/agent-machines/release-proof.txt` source path and original run key; actual stored bytes were accessible under the destination HOME.
- The explicitly retained E2B source was still running with pause-on-timeout protection. Its original proof, fixture, Git state, canonical memory, derived entrypoints, native session, artifact, and executable launcher remained unchanged.

## Runtime follow-up and limits

The destination did **not** yet have `~/.agent-machines/bin/am-launch-agent` before its first terminal attachment. The original source did. The initial independent verification therefore returned exit code 1 for the strict launcher-exists expectation, despite all data comparisons passing. The subsequent UI check at `08:07:51Z` exercised the intended lazy setup: attaching Terminal created the launcher and opened a real Claude Code prompt, showing Sonnet 4.6 and `~/agent-machines`, without manual installation. Independent readback at `08:10:26.563Z` confirmed the generated launcher executable, 3,096 bytes, with the exact source hash `d291fc06385b87b0d3fe2d58bf3c30c51ce3559c596e60b62f616c24a091a86f` and no hardcoded `/home/user` path. The target CLI was version 2.1.233 versus source 2.1.266; replaceable runtime binaries were not asserted identical.

The restored hosted Console also completed a paid continuation in 16.6 seconds: operation `c36b0f9a-91ff-4761-b439-ab16742019d8`, new native Claude session `e44d9da0-5cde-4302-9b2f-b4b5ea4464d7`. Asked for the filename from its prior turn without naming that file, it recalled `release-proof.txt`, used the actual destination project at `/home/sprite/agent-machines`, and read the exact preserved contents. This proves restored logical conversation context plus real execution on the new provider. It is **not** a test of native `--resume` against the original archived session ID; that narrower capability remains unverified.

This proves one actual hosted, idle-workload, cross-provider state migration with inspectable evidence and a preserved source. It does not prove transfer of process memory, uninterrupted active processes, arbitrary provider compatibility, or an uptime SLA. Credentials and replaceable dependencies are not claimed portable. Sprites reported a cold record before inspection and serves reads by automatically waking compute; this is its provider lifecycle behavior, not an explicit Pause/Wake guarantee.

Sanitized machine-readable source and destination evidence is retained in `/tmp/agent-machines-launch-20260909/release-migration-source.json` and `release-migration-destination.json`; the independent executable inspector is `verify-release-migration.ts` in that directory. No user or QA resource was deleted during this audit.
