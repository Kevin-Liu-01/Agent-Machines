---
name: simple
description: Frame any technical answer as a reproducible five-part diagnosis. Use when the user asks for a root-cause explanation, a fix proposal, a debugging write-up, or says "explain why", "what's the problem", "propose a fix", or invokes `/simple`. Forces the answer into: problem, evidence, proposal, mechanism, test methodology.
---

# Simple

A single reasoning template. Every answer has the same five parts in the same order. No headers. No bullets. No preamble. The shape itself teaches whoever reads it to think in cause and effect.

## Contract

Respond in exactly five sentences or short paragraphs, in this order:

1. **X is the problem.** State the root cause in one sentence. Name the actual thing, not a symptom. If the cause is "the code is slow", you have not finished diagnosing.
2. **We know this because Y.** Cite the evidence. Measurements, strace output, log lines, code paths, invariants, benchmarks. Numbers beat adjectives. If you cannot cite evidence, you are guessing and should stop.
3. **I propose we use Z to fix this.** Name the fix. One concrete intervention, not a list of options. Be specific enough that a reader could act on it without asking a follow-up.
4. **This is because Z does {mechanism} that helps this problem.** Explain how the fix acts on the cause. The reader should be able to predict the fix's behavior from first principles, not take your word for it.
5. **We can test and reproduce this by {methodology}.** Give the experiment. A command, a benchmark, a pjdfstest run, a targeted reproducer. The experiment must be able to falsify the proposal, not just confirm it.

End with a single line: `Give it a try.`

## Rules

- **One cause per answer.** If there are two causes, write two `/simple` answers.
- **No hedging.** "This might be the problem" means you don't know. Go measure.
- **No options menu.** Picking between alternatives is a separate kind of answer. `/simple` proposes one fix.
- **Mechanism before methodology.** If you can't explain *how* the fix works, your test plan is cargo-culted.
- **Falsifiable test.** The methodology must be capable of showing the proposal is wrong, not just showing some improvement.
- **Evidence is load-bearing.** Never skip part 2. If you don't have numbers or a code pointer, go get them before writing the answer.

## When to use

- A user asks "why is X slow" / "why does Y fail" / "what's causing Z".
- You have just completed a diagnostic investigation and need to report it.
- The user says "explain the problem" or "propose a fix".
- The user invokes `/simple`.

## When NOT to use

- Open-ended design discussions with no single fix.
- Code reviews (use prefixed comments per `.github/review.md`).
- Greentext-style sequential walkthroughs (use `/greentext`).
- Status updates or progress reports.

## Examples

### Example 1: FUSE open/close latency

X is the problem: FUSE open/close round-trip latency dominates metadata-heavy workloads. Every `openat` costs 149 µs and every `close` costs 233 µs regardless of how fast SQLite commits underneath.

We know this because 30 seconds of strace on `npm install` shows 8,960 `close` calls consuming 2.09 s (38% of wall time) and 10,598 `openat` calls consuming 1.58 s (29%), totaling 67% of wall time on two syscalls, while `write` at 9 µs/call and `read` at 5 µs/call are not the bottleneck. The coalescer benchmark puts SQLite commits at ~4 µs/op at batch=128, so the 149-233 µs is the guest→virtio→vhost-user-fs→daemon→reply round trip, not the database.

I propose we use the `FUSE_NO_OPEN_SUPPORT` / `FUSE_NO_OPENDIR_SUPPORT` capability flags in `FUSE_INIT` to fix this.

This is because those flags tell the kernel FUSE driver to skip the `FUSE_OPEN` and `FUSE_RELEASE` requests entirely: open succeeds at the VFS layer from cached inode attributes, and only reads and writes round-trip to the daemon. The 67%-of-wall-time cost collapses at the protocol level with no schema, tiering, or disk change.

We can test and reproduce this by running `strace -c -w -p $(pgrep npm)` during `npm install typescript eslint prettier` on a DCS workspace before and after the flag lands, comparing `openat` and `close` per-call times, and asserting that POSIX semantics hold via `pjdfstest` + the mount-helper harness. The proposal is falsified if per-call times do not drop below 20 µs or if any `pjdfstest` case regresses.

Give it a try.

### Example 2: fd leak on machine recreate

X is the problem: `VhostUserDaemon` leaks eventfds across machine create/destroy cycles. After 50 cycles the host hits EMFILE and refuses new machines.

We know this because `lsof -p $(pgrep host-agent)` after 50 recreate cycles shows 1001 eventfds open against the daemon PID, and `/proc/$PID/fd` lists them all as anonymous `eventfd:[N]` entries with no owning thread. `epoll_ctl` tracing confirms the daemon's constructor spawns worker threads that register eventfds on epoll but nothing unregisters them on `Drop`.

I propose we use an explicit `shutdown()` call on the daemon's worker pool from the destroy path, with the workers joining on a cancellation token inside `Drop`.

This is because RAII alone does not propagate a stop signal into running worker threads; threads waiting on epoll need an explicit wake to exit their loop. A cancellation-token-plus-join pattern in `Drop` guarantees that by the time the `VhostUserDaemon` value is gone, every worker has returned and every eventfd it registered has been closed by the kernel.

We can test and reproduce this by running `cargo test daemon_fd_leak_stress -- --ignored`, which creates and destroys 100 daemons in a loop and asserts that `lsof -p $$` returns to the baseline fd count within 50 ms of each destroy. The proposal is falsified if fd count does not converge to baseline after shutdown.

Give it a try.

## Response template

```
X is the problem: [one-sentence root cause].

We know this because [evidence: measurements, traces, code paths].

I propose we use [one concrete fix] to fix this.

This is because [mechanism: how the fix acts on the cause].

We can test and reproduce this by [falsifiable experiment].

Give it a try.
```
