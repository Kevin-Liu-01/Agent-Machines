# Release and first-Worker verification

This procedure checks the deployed product from a new account through completed
work. Passing the local suites proves the checked contracts; it does not prove
that Clerk, Supabase, the selected sandbox, and the model provider are wired
together on the deployed domain. Record the commit, deployment URL, runtime,
provider, Worker ID, and result for each live run. Never record keys or tokens.

## Reproduce the build

Use Node `^20.19` or `>=22.12` and the pinned pnpm 10.30.0 from the repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
git diff --check
```

`pnpm check` runs the mux, lifecycle, SDK, CLI, and dashboard tests; both typechecks;
the SDK and Next.js production builds; and an isolated tarball import check. The
tarball check resolves the root, mux, and control-plane entry points with both
ESM and `require()`, without borrowing this checkout's dependencies.

No check above creates a sandbox or calls a model. Builds prepare local data from
committed sources and leave marketplace snapshots unchanged. An intentional
catalog update uses `pnpm --dir web refresh-catalog`; review and commit both
`knowledge/` and `web/data/` before building the release.

## Local development is not production authentication

Run `pnpm web` from the repository root and open
`http://127.0.0.1:3210/dashboard`. Preserve an existing ignored `web/.env.local`;
copy the example only for a new checkout. With `ALLOW_DEV_AUTH=1` and Clerk keys
left blank, `next dev` uses the synthetic development user and file-backed
configuration. Restart the development server after changing its environment.

The bypass requires `NODE_ENV=development`; it does not grant access in a
production build. A rendered local dashboard or HTTP 200 under this bypass is
not a sign-in test. To test real local Clerk authentication, disable the bypass
and configure a Clerk development instance. Keep the production proxy URL unset
locally and in previews.

## Configure the deployment

- Use Clerk production keys for the production domain. Verify the allowed
  origins, sign-in redirect, and sign-up settings in the same Clerk instance.
  Publish its required DNS records and verify that Clerk has issued the Frontend
  API and Account Portal certificates. A production key by itself does not make
  the authentication domain reachable.
- Configure Supabase and apply `web/supabase/migrations/001` through the latest
  migration in filename order. The operation journal requires migration 009;
  migration 010 removes the retired Dedalus model gateway.
- Set `CRON_SECRET` and confirm the deployed `web/vercel.json` schedules are
  enabled. A scheduled prompt should execute on the next eligible five-minute
  tick, with its run and operation history visible afterward.
- Keep `ALLOW_DEV_AUTH=0` for sign-up verification. Local bypass sessions do not
  exercise production authentication.
- New hosted accounts provide their own sandbox and model credentials. If the
  deployment owner should use server env defaults, set the exact Clerk user ID
  in `AGENT_MACHINES_OWNER_USER_ID`. Other accounts must start without those
  credentials or the owner's machines.

The complete configuration template is
[`web/.env.local.example`](../web/.env.local.example). Active sandbox providers
are Daytona, E2B, Sprites, and Vercel. Retired provider records remain identifiable
for safety, but cannot supply a new launch, API call, or automatic conversion.

### Hosted authentication domain

The canonical hosted origin is `https://www.agent-machines.dev`, under Clerk's
primary domain `agent-machines.dev`. Vercel redirects both `agent-machines.com`
and `www.agent-machines.com` to this origin with HTTP 308, preserving paths and
queries. This is a whole-domain redirect, including public pages and APIs; it
supersedes the earlier policy that kept marketing and API requests on `.com`.
The `.dev` apex's blanket Vercel redirect is now unset. The application serves
the active `/__clerk` proxy there and redirects every other apex path to `www`
with HTTP 307; the public canonical stays `www`.

SDKs and other API clients must target `https://www.agent-machines.dev` directly
(for example, `AGENT_MACHINES_URL=https://www.agent-machines.dev`). HTTP 308
preserves the method and body when followed by a conforming client, but clients
may drop authorization headers across origins. Do not rely on redirects to
transport credentials or server-action requests.

Independently of Vercel's domain configuration, the application proxy retains
its narrower auth-host policy as defense in depth: with this exact production
Clerk instance configured, `.com` GET/HEAD requests to `/sign-in`, `/onboarding`,
and `/dashboard` (including nested routes) redirect before Clerk processes them.
That application policy excludes APIs and POST requests and does not activate
for local development or other Clerk instances. The Vercel redirect applies
before those application-level exclusions. See the
[domain canonicalization audit](reports/2026-09-09-domain-canonicalization.md)
for the verified settings and rollback boundary.

Keep `redirect_url` destinations relative and validated. OAuth providers instead
use the exact callback URL shown in the production Clerk connection settings;
do not substitute the marketing homepage. Enable only the scopes needed for
sign-in. Verify each selected provider through its real consent and callback
flow after credentials, DNS, and certificates are configured.

### Same-site Clerk proxy rollout

The apex proxy is active in production on source `37de0ac`, using the official
`clerkFrontendApiProxy` helper without removing session or SDK authorization
checks. Real Chrome verified GitHub login, onboarding, a Codex `gpt-5.6-sol`
Worker on Daytona, its completed task, and artifact read-back. The exact fixture
was stopped and retained for inspection, not deleted. Google/X login remains
separate proof. See the
[production auth and Worker evidence](reports/2026-09-09-production-auth-readiness.md).
Follow [Clerk's proxy guidance](https://clerk.com/docs/guides/dashboard/dns-domains/proxy-fapi).

Clerk requires the exact configured apex domain `agent-machines.dev`; both its
UI and Backend API rejected the proposed `www` proxy. The corrected URL is
`https://agent-machines.dev/__clerk`, same-site but cross-origin from the public
`https://www.agent-machines.dev` application. Do not change Clerk's primary
domain, keys, or user identities to accommodate the earlier URL.

The completed activation used this order; preserve it when repeating the rollout:

1. **Server before routing.** Deploy the apex `/__clerk`
   handler plus the application's HTTP 307 apex-to-`www` redirect for every other
   path. Require the exact apex origin, production `.dev` Clerk keys,
   `NODE_ENV=production`, and `VERCEL_ENV=production`. Keep client proxy settings
   unset and Clerk's domain proxy configuration unchanged.
2. **Expose and verify the handler.** Only after that deployment is Ready, remove
   Vercel's blanket apex redirect. Verify that apex `/__clerk` reaches the proxy
   while other apex paths still redirect to `www` with their paths and queries.
   Check forwarding, local/preview/wrong-host exclusions, and retained session
   and API authorization gates; never expose the server secret.
3. **Activate after verification.** Configure and verify
   `https://agent-machines.dev/__clerk` in the production Clerk domain UI. Set
   `NEXT_PUBLIC_CLERK_PROXY_URL` to that exact URL in Vercel Production and
   redeploy. The current saved callback for all three social providers is
   `https://agent-machines.dev/__clerk/v1/oauth_callback`. Verify browser loading,
   sessions, each required OAuth callback, and a fresh account's completed Worker
   task; successful activation alone does not complete that final check.

For rollback after activation, remove the production client setting and redeploy,
restore Clerk's previous domain proxy configuration, and retain the handler
until no active client or configuration references it. Only then restore the
blanket Vercel apex-to-`www` redirect before removing the app handler and redirect.
Before activation, the same routing ordering applies if Vercel's rule was already
removed. Direct-CNAME rollback does not fix this network's DNS failure. Preserve
the existing keys, CNAMEs, identities, and authentication gates.

## Follow a new account to its first result

1. Open a fresh browser session on the deployed URL. Check the landing page,
   Worker catalog, docs, sign-in, and account creation at desktop and mobile
   widths. Confirm a signed-out dashboard request leads to authentication.
2. Create a new account and complete onboarding. Its fleet starts empty. Reload
   once to verify setup persists and that returning users reach the dashboard.
3. Choose a preconfigured Worker from the dashboard. Confirm the recipe's runtime,
   model, loadout, and responsibility are visible before provisioning.
4. Connect a sandbox key and a compatible model key. A missing or incompatible key
   must produce a useful error before a paid sandbox is created. Use a supported
   pair such as Claude Code + Anthropic on E2B, or Codex + OpenAI on Sprites.
5. Launch once. Observe provision and bootstrap progress through a ready state.
   Reload during bootstrap and reattach; the operation must remain visible and
   must not create a duplicate machine.
6. Submit a bounded task with an observable output, such as creating
   `launch-proof.txt` with a unique non-secret marker and reporting its SHA-256.
   Confirm the agent responds, the terminal accepts input, and the file exists
   in the Worker's workspace. Record the marker and checksum as evidence.
7. Close and reopen the Worker, then open a new browser tab. Confirm the same
   Worker, file, and operation history remain accessible. Switch between two
   Workers and confirm terminal input and output stay scoped to the selected one.
8. Visit its files/artifacts, logs, sessions, loadout, usage, and operation history.
   Empty states should explain what is absent. Installed tools and reported costs
   must agree with the actual run; an unknown cost must not be presented as zero.

## Check lifecycle and supervision

Exercise each capability claimed for the launch on a disposable test Worker:

- Pause and resume where the provider supports it. Run another command and
  verify the original file checksum.
- Switch to another configured runtime and run a bounded task. Verify the
  Worker remains associated with the same workspace and durable files.
- Migrate to another credentialed provider. Verify the destination runs a
  command and the original file checksum matches before accepting cutover.
  Application-level handoff restarts processes from durable state and can copy
  supported saved runtime histories; it does not transfer RAM or a live native
  process/session across providers.
- Add a scheduled job, observe one real scheduled dispatch, and inspect its
  output and history. Disable or remove the test schedule afterward.
- Trigger a recoverable failure, such as an invalid test model credential.
  Confirm the error explains what to fix, save the corrected credential, and
  retry without creating an unwanted second Worker.
- Sign in as another ordinary account. Confirm the first account's Workers,
  keys, files, logs, and operations are inaccessible from the UI and API.
- Delete the test Worker through the dashboard. Confirm the provider reports
  its resource gone and the fleet reflects completion. Keep any resource that
  the user asked to retain; identify it explicitly in the test record.

## Release evidence

For each gate record **passed**, **failed**, or **not verified**, with its observed
result. A deployment is ready only when required gates pass on the commit being
released. A local build, a historical provider matrix, and an owner account's
working terminal cannot substitute for the new-account flow above.

After committing and pushing, verify that the deployed revision matches the
commit and repeat the signed-out → sign-up → launch → completed-output path on
the public domain. Confirm the test resources and schedules were cleaned up.
