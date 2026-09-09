# Hosted domain canonicalization — September 9, 2026

The canonical hosted origin is now `https://www.agent-machines.dev`. This report
records the verified Vercel domain configuration and HTTP redirect behavior;
it does not establish successful Clerk authentication or a completed account
and Worker flow.

## Current follow-up — apex proxy exception

The later production proxy rollout on `37de0ac` supersedes the blanket apex
redirect in the original table below. The `agent-machines.dev` Vercel domain
redirect is now `null`. The application serves `/__clerk` and its descendants
on that apex, and redirects other apex paths to `www.agent-machines.dev` with
HTTP 307. Both `.com` domains still use Vercel's whole-domain HTTP 308 redirects;
the public and API canonical origin remains `https://www.agent-machines.dev`.

The application handler and redirect were Ready before the blanket Vercel apex
rule was removed. Clerk's enabled proxy URL is `https://agent-machines.dev/__clerk`;
all three saved OAuth callbacks use
`https://agent-machines.dev/__clerk/v1/oauth_callback`. The proxy
is same-site but cross-origin from the public `www` app. See the
[activation and rollback order](../LAUNCH.md#same-site-clerk-proxy-rollout).
Do not restore a blanket apex redirect while active Clerk clients depend on
this handler.

GitHub account-to-completed-Worker proof subsequently passed on `37de0ac`;
Google/X consent, callback, and authenticated reload passed on documentation-only
`32a8648`. These separate checks are recorded in the
[production authentication report](2026-09-09-production-auth-readiness.md),
not inferred from a domain's verified status.

## Original configuration change — 21:25 UTC checkpoint

Only the `agent-machines.com` and `www.agent-machines.com` domain records in
Vercel project `prj_zQsrv2PEzKRJwOQpWCIhKhPLcKdU` were patched. Each was set to
`redirect: www.agent-machines.dev` and `redirectStatusCode: 308`. Both update
responses reported `verified: true`.

| Domain | Behavior at this original checkpoint |
| --- | --- |
| `agent-machines.com` | HTTP 308 to `www.agent-machines.dev` |
| `www.agent-machines.com` | HTTP 308 to `www.agent-machines.dev` |
| `agent-machines.dev` | Existing HTTP 307 to `www.agent-machines.dev`, unchanged |
| `www.agent-machines.dev` | Existing deployment binding, unchanged |

This is a Vercel domain-level change. It took effect without a runtime build or
new deployment and does not depend on a change to the application's proxy.

## Observed HTTP checks

Two `curl` HEAD requests independently confirmed HTTP 308 and exact `Location`
values, including encoded query values and repeated query parameters:

| UTC | Request | Location |
| --- | --- | --- |
| 21:25:38 | `https://agent-machines.com/pricing?redirect_probe=keep%2Fthis&tag=one&tag=two` | `https://www.agent-machines.dev/pricing?redirect_probe=keep%2Fthis&tag=one&tag=two` |
| 21:25:39 | `https://www.agent-machines.com/sign-in?redirect_url=%2Fdashboard%2Fworkers` | `https://www.agent-machines.dev/sign-in?redirect_url=%2Fdashboard%2Fworkers` |

These checks prove the stated HEAD redirects, not a POST replay, an authenticated
API request, an OAuth callback, or a successful login.

## Client and application boundaries

The whole-domain redirect includes APIs as well as public and authenticated
pages. Clients must target `https://www.agent-machines.dev` directly, including
through `AGENT_MACHINES_URL`. HTTP 308 preserves method and body for conforming
clients that follow it, but authorization headers may be dropped across origins.
Do not assume existing `.com` SDK, webhook, or server-action requests remain
authenticated after following a redirect.

The application proxy still has its independent, narrower auth-host redirect:
only GET/HEAD requests to the exact sign-in, onboarding, and dashboard route
families on the allowlisted `.com` hosts, with the exact production `.dev` Clerk
key configured. It runs before Clerk and excludes APIs and POST requests.
That remains defense in depth; its exclusions do not override Vercel's broader
domain redirect.

The dashboard's copied SDK environment example and the served `llms.txt` SDK
example were updated to use `.dev` directly. The SDK still rejects redirects
(`redirect: "error"`); its localhost default is unchanged. `SITE.url` now uses
`.dev`, so canonical metadata, OpenGraph, structured data, robots, and sitemap
URLs agree with the destination host.

Two new regression tests failed against the old `.com` values and passed after
these changes. The targeted web run passed 55 tests (including SEO and the
existing application auth-host policy); all 48 SDK tests also passed.
The web typecheck (including the SDK build and offline data sync) passed, and
`git diff --check` was clean. No tracked generated files changed.

## Reversal and remaining proof

The following rollback concerns only the two `.com` domain records. The later
active apex proxy requires the coordinated rollback linked above; its exception
must not be removed merely to reproduce the historical table.

The prior configuration can be restored in the same Vercel project's domain
settings: remove the `www.agent-machines.com` redirect to restore its deployment
binding, and set `agent-machines.com` to redirect to `www.agent-machines.com`
with the prior HTTP 307 behavior. No application redeployment is required to change these domain
settings. Because HTTP 308 is permanent, clients may retain cached redirects
after a settings rollback; verify fresh requests as well as affected clients.

No Clerk DNS, certificate, provider credential, or authentication success is
implied by Vercel reporting a domain as verified. Live OAuth and the full
new-account-to-completed-Worker flow remain separate verification requirements.
No secrets are included in this report.
