# Provider timeout and disk durability audit

Scope: adapter source, installed SDK, and official documentation; no live resources created, resumed, or modified.

## Vercel

Automatic session timeout **does capture the latest filesystem** for persistent sandboxes, just like explicit stop. Our adapter sets `persistent: true`; in-memory processes still stop. [Official snapshot lifecycle](https://vercel.com/docs/sandbox/concepts/snapshots#how-snapshots-are-created).

The separate hazard was snapshot retention: the default is 30 days since last use. New Agent Machines Workers now set the installed SDK's supported `snapshotExpiration: 0` option. This retains snapshots until explicit deletion and can continue incurring storage charges while compute is stopped. Existing sandboxes are not modified, and no snapshot-history pruning policy is imposed. [Official retention settings](https://vercel.com/docs/sandbox/concepts/persistent-sandboxes#default-snapshot-expiration-and-retention).

The installed SDK's `Sandbox.getOrCreate` handles `snapshot_not_found` by deleting the named sandbox and creating a fresh one. The adapter no longer uses that helper: it reads by name without resuming, creates only on an explicit sandbox-not-found 404, and fails without replacing state on missing snapshots, credentials errors, or ambiguous failures. Regression fixtures cover new/existing Workers and these failures. This is source/contract verification, not a live timeout experiment.

Deleting a Vercel Worker does **not** delete its provider snapshots. They can remain billable after the sandbox is gone. The dashboard's destroy/delete confirmation discloses this before proceeding; remove unwanted snapshots explicitly in Vercel using its [snapshot cleanup controls](https://vercel.com/docs/sandbox/concepts/snapshots#delete-a-snapshot). Agent Machines does not automatically prune or delete snapshot history.

## Sprites

There is no adapter-configured destructive session TTL. Vendor idle behavior preserves the filesystem, but a cold wake loses memory/processes; managed services restart at boot. The SDK's default 30-second timeout concerns HTTP requests, not deleting the Sprite. [Official lifecycle](https://docs.sprites.dev/concepts/lifecycle/).

## Dedalus

The adapter does not send a machine TTL. Current vendor documentation specifies autosleep after five idle minutes, preserving the root filesystem; `/tmp` is scratch. No comparable automatic disk-deletion default was found. The adapter comment claiming there is no autosleep API is stale: current create/update APIs document it, but this audit does not change that integration. [Official lifecycle](https://docs.dedaluslabs.ai/dcs/dm/lifecycle), [create API](https://docs.dedaluslabs.ai/dcs/api/machine-lifecycle/create-machine).
