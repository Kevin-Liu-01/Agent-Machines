# Daytona adapter: local live proof

Verified on 2026-09-09 with `@daytona/sdk` 0.211.2 and explicitly authorized disposable resources. No model calls, production configuration changes, or existing Worker migrations were performed by this adapter audit. Credentials stayed in a private local environment file and were not committed or printed.

## Actual resources

| Resource | Role | Provider-reported allocation | Home |
| --- | --- | --- | --- |
| `c5b11be3-342d-45c0-8f01-61c10a13f381` | Default-snapshot lifecycle / command / PTY proof | 1 vCPU, 1 GiB RAM, 3 GiB disk | `/home/daytona` |
| `24b471d1-4025-4f0f-808c-e22099d6f38a` | Explicitly authorized sizing proof; handed to runtime QA | 1 vCPU, 2 GiB RAM, 3 GiB disk | `/home/daytona` |

Both were created private, non-ephemeral, with automatic deletion disabled (`autoDeleteInterval: -1`), no lifetime expiry (`ttlMinutes: 0`), and no automatic stop/pause. Running resources consume compute; stopped resources retain their files and may consume storage. Their IDs were recorded for subsequent runtime proof and explicit cleanup.

After the local checks, the first resource was explicitly parked through the adapter. A fresh non-waking description confirmed `sleeping` / vendor `stopped`, with its original allocation intact. The second resource was handed to runtime QA; that agent subsequently parked it and confirmed `stopped` at 09:24:25 UTC, before later explicitly authorized compatibility checks.

At 10:31:29 UTC, the first fixture (`c5b11be3-342d-45c0-8f01-61c10a13f381`) was explicitly deleted after independently matching its exact ID, QA name, and stopped state. A new provider description confirmed `destroyed`. Its disposable disk was removed; the proof reports remain. The second fixture was retained for runtime compatibility testing, not included in that deletion.

## Passed against the actual provider

- A file retained SHA-256 `0939bf6f60379890c1bf880617cc92f267648a78cd2a1526c7714c59f04fd224` across stop → non-waking record lookup → start. The intermediate lookup still reported `stopped`.
- The user and home were observed as `daytona` and `/home/daytona`. Bash and GNU timeout were present; Node was installed under `/usr/local/share/nvm/current/bin/node`.
- The adapter returned separate stdout/stderr and a real nonzero exit code (`7`). A streamed command emitted two incremental stdout events and ended with exit code `3`.
- A one-second guest timeout returned `124` in approximately 1.4 seconds and prevented the command's later file write. This is one functional observation, not a latency guarantee.
- Aborting after the first streamed output cancelled the command; a subsequent check confirmed its delayed file write never happened.
- Detached background work survived the short launch request and session cleanup.
- A native PTY produced the expected output and exit code `0`; closing an already-finished PTY succeeded. A named native PTY retained an environment variable across disconnect/reattach.
- Private signed preview URL generation succeeded without making the sandbox public. URLs expire after five minutes and must be requested afresh; the signed URL and token were not logged.

## Live API corrections

The SDK documents `sandbox.resize()`, but this account's live service returned `404: Cannot POST /api/sandbox/<id>/resize`. This is an absent API route, not evidence that the sandbox was deleted. The adapter does not use that endpoint.

Requested sizing instead uses the documented image-plus-resources creation path. `daytonaio/sandbox:0.8.0` was read from the provider's own default snapshot record and reused as a pinned image; the second resource proved an actual 2 GiB allocation. The adapter refreshes and verifies the allocation before returning. A failed verification rolls back only the newly created sandbox; a failed rollback reports the exact orphan ID. Snapshot templates plus explicit resources fail before creation because the snapshot's fixed allocation cannot honestly be overridden through the currently available resize API.

Daytona command sessions require their original shell to remain alive to report completion. Replacing that shell with `exec` caused a request to reach its finite HTTP timeout even though the child command had exited. The adapter now runs its timeout wrapper in a child shell; the live split-output and exit-code checks then passed.

## Regression checks

`pnpm exec tsx --test src/mux/providers/daytona.test.ts src/mux/providers/conformance.test.ts src/mux/providers/no-wake.test.ts src/mux/providers/dedalus-retired.test.ts`

The provider suite covers credentials-before-network, bounded requests, durable/private creation, observed sizing and rollback, no implicit wake, shell quoting with an executable fixture, stream output/cancellation, native terminal lifetime, binary file writes, and fresh expiring previews. The shared conformance suite now exercises E2B, Sprites, Vercel, and Daytona; Dedalus is tested separately as a retired no-network compatibility discriminator, including when old credentials are supplied.

Result: **142/142 passed**, with no skipped tests. Root TypeScript checking and `pnpm build:sdk` also passed; the compiled provider factory and declaration output include Daytona. Test output is retained locally at `/tmp/agent-machines-launch-20260909/daytona-provider-tests.log`.

The CLI/router/constraint fixtures were then updated to the active provider set: **85/85 passed**, without skips. Synthetic profiles still test unavailable GPU selection, absent streaming, and unknown port counts independently of any provider's advertised capabilities. Output: `/tmp/agent-machines-launch-20260909/daytona-routing-tests.log`. The packaged SDK also passed isolated-consumer import/require verification (`pnpm verify:sdk`).

Two allocation-policy tests failed before replacing unsupported resize with verified image creation; both pass with the implementation. These are adapter and local-provider proofs, not a claim that hosted deployment, cross-provider migration, model runtimes, or billing have all been verified.

## Post-acceptance creation failure review

The installed SDK creates the sandbox, then waits for startup before returning its handle. A timeout during that wait throws a generic error without the sandbox ID; `timeout: 0` disables the deadline rather than returning immediately. The adapter now assigns a fresh random `agent-machines-create-id` label to each create request. If creation fails before returning a handle, it queries only that label, rejects unexpected or multiple results, then independently rechecks the exact ID and label before rolling back the uniquely identified new sandbox. It never recovers or deletes by a user-provided name.

Recovery reads have a 30-second overall deadline. A late lookup cannot perform a late deletion. Missing, ambiguous, or failed lookups report the creation label for manual review; failed deletion reports the exact sandbox ID. Both conditions use a non-routable error because this mux treats `fatal` as eligible for failover. The adapter does not replay the creation POST. If the provider accepted a request but the resource is not yet visible, its eventual existence remains unresolved—not falsely reported as cleaned up.

Five tests failed before this fix, including four new invariants and the updated creation contract. Final focused coverage is **149/149 passing**, with zero skips, including the installed SDK's actual create method exercising a post-acceptance startup timeout against substituted transport/state-wait boundaries. Root typecheck, SDK build, packaged-consumer verification, and diff checking also passed. No live resources were created, changed, or deleted for this review.

## Primary references

- [Daytona SDK configuration and creation](https://www.daytona.io/docs/en/typescript-sdk/daytona/): bounded request timeout, image resources, disabled deletion/TTL.
- [Sandbox lifecycle and resource units](https://www.daytona.io/docs/en/typescript-sdk/sandbox/): stop/start, observed allocation, private signed previews.
- [Process and PTY APIs](https://www.daytona.io/docs/en/typescript-sdk/process/): sessions, execution, and native terminal reattachment.
- [Daytona preview access](https://www.daytona.io/docs/en/preview/): private preview authentication and signed expiry.
