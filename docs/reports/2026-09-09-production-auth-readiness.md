# Production authentication follow-up — September 9, 2026

## Subsequent production checks — Google, X, and QA cleanup

Documentation-only commit `32a8648` became Production/Ready deployment
`dpl_HPFRP8YoTpuouXsfEMcxpi45k43L`. Real Chrome then separately signed out and
completed Google and X OAuth consent through the configured apex callback.
Both returned to the authenticated Fleet; a full reload still showed the same
stopped `Coding Agent-653158` Worker. Google requested name/profile and email.
X showed its required read/email/offline permissions and an unverified-developer
warning; no posting permission was requested or used.

One X sign-in was exercised against existing prepaid access. The console showed
$4.76 before and after the check; this is not proof that profile lookups are free.
No credits were purchased and auto-recharge remained off. X documents metered
[user-profile reads](https://docs.x.com/x-api/getting-started/pricing).

At 22:37 UTC, the owner-approved administrator cleanup removed six saved secret
fields from the two old development QA accounts and disabled their annual test
schedule. Fresh reads proved the exact changes and preservation of unrelated
metadata. See the [cleanup record](2026-09-09-qa-cleanup.md).

A separate ordinary account completed interactive Princeton sign-in. Its
hydrated Fleet was empty (zero machines), and Settings reported no SDK key,
no configured credentials, and empty provider/model credential statuses.
Direct links to the first account's known Worker, Artifacts, Logs, and Console
pages returned the application's 404 page. After separate explicit approval,
a temporary SDK key exercised read-only cross-account API checks: machine,
session, Worker recipe, and existing operation reads were rejected, and
artifacts/chats/logs returned no data. The key was revoked in Settings; an
independent request using it then returned 401. No second-account Worker or
provider/model credentials were added. See the exact bounded checks in the
[post-auth release record](2026-09-09-post-auth-release.md); this is not an
exhaustive authorization audit.

## Current operation — GitHub account-to-Worker flow passed

Source `37de0ac` is deployed as Production/Ready deployment
`dpl_5KdVA5itYcmqkTVhNXu2KpjNkETD`
(`agent-machines-3shnftf6o-kl01s-projects.vercel.app`), with
`NEXT_PUBLIC_CLERK_PROXY_URL=https://agent-machines.dev/__clerk`.
Clerk's production domain UI reports the apex proxy enabled. The public app
remains `https://www.agent-machines.dev`: this is **same-site, not same-origin**.
The exact production-key, environment, and origin gates retain session and SDK
authentication; no primary-domain, key, or existing user-identity migration was
used to repair browser access.

Vercel's blanket apex redirect was cleared only after the application's
apex-to-`www` redirect deployment was Ready. The apex domain's platform redirect
is now `null`; `/__clerk` reaches the handler, while other apex paths use the
application's HTTP 307 redirect. Checks covered `/`, a docs URL with encoded and
repeated query parameters, a `_next` static asset path, and `/__clerk-extra`;
each redirected to the corresponding `www` path with its query preserved.

The actual Frontend API environment GET and client OPTIONS requests returned
HTTP 200 with `Access-Control-Allow-Origin: https://www.agent-machines.dev` and
`Access-Control-Allow-Credentials: true`. ClerkJS 6.31.0 and UI 1.32.1 assets
returned HTTP 200. In real Chrome, the sign-in form rendered; GitHub consent
requested only read access to email and profile, returned through the apex
callback, and reached authenticated **Pick your agent** onboarding as
`Kevin-Liu-01`. The subsequent onboarding and first completed Worker task are
verified below.

The exact saved callback for GitHub, Google, and X is
`https://agent-machines.dev/__clerk/v1/oauth_callback`; all three saves were
verified. At this initial GitHub checkpoint Google and X had not been exercised;
the subsequent real-flow checks above supersede that boundary. See the
[social login report](2026-09-09-social-login-setup.md).

The full web suite passed 1,716 tests with 37 explicit skips. Separately, 128
focused tests and TypeScript passed; these counts are not additive. The
[rollout and rollback procedure](../LAUNCH.md#same-site-clerk-proxy-rollout)
records the dependency order needed to keep the active proxy reachable.

### First production Worker and artifact — passed

The authenticated account selected the Coding Agent preset, Codex CLI, and
Daytona. Existing, explicitly approved Daytona and OpenAI credentials were
entered through the onboarding UI. Launch completed and automatically opened
the authenticated runtime Console with Codex `gpt-5.6-sol` ready.

| Evidence | Observed value |
| --- | --- |
| Machine | `b99cf49a-f0dd-4f13-9785-58bec785b3ce` (`Coding Agent-653158`) |
| Observed Daytona allocation | 1 vCPU, 2 GiB RAM, 10 GiB disk |
| Managed UI task | `97bdc0b1-2d17-40f6-a981-109e6424a07b`, completed in 41.5 seconds |
| Native Codex session | `01a0883b-5aeb-7cd1-9b9c-9d8809120c49` |
| Artifact | `auth-launch-verification.md`, 428 bytes |
| Artifact path | `/home/daytona/.agent-machines/artifacts/auth-launch-verification.md` |

The artifact was opened and independently read back through the authenticated
Artifacts UI. Its preview contained the expected runtime, current directory,
and non-secret file information. This verifies the actual sequence: production
GitHub login, preset selection, provider-key save, launch, runtime Console,
completed task, and inspected artifact. It does not verify Google or X login,
every runtime/provider pairing, or later lifecycle persistence.

Independent production checks passed and the bounded authentication-error scan
found zero errors. However, one `GET /api/dashboard/chats` returned HTTP 502 at
22:13:10 UTC, then recovered on the next poll while the task completed. The cause
was not established. This is not a zero-5xx or long-term reliability claim.

The UI deletion confirmation timed out in browser automation; deletion was not
completed or claimed. Cleanup instead preserved this exact fixture for the
owner to inspect. A fresh SDK lookup matched its ID, name, and `started` state;
one `sandbox.stop(40)` call succeeded, and an independent fresh GET confirmed
`stopped`. The machine was **stopped, not deleted**. Its filesystem and verified
artifact are retained, and explicit wake remains available. No other resource
or credential was changed. This is recoverable retention, not provider-absence
proof or a guarantee of zero storage charges.

### Local verification and preceding failure

Public DNS, TLS, and Clerk verification pass. The preceding local-router checks
(`192.168.1.254` and its IPv6 upstream) returned `NXDOMAIN` for
`clerk.agent-machines.dev`, despite public resolver success. The working apex
proxy repaired the tested browser flow without claiming that the router's DNS
cache was corrected or changing system DNS settings.

Separately, the local development server at `http://127.0.0.1:3210` is running
with the existing ignored `ALLOW_DEV_AUTH=1` setting and no Clerk keys. The real
Chrome dashboard renders, and the checked local health, page, and API requests
returned HTTP 200. This is the development-only synthetic-user path, not Clerk
sign-in, production authorization, or new-account proof.

### Rejected initial proxy URL — historical

Stage A commit `7dcd3ae` became Ready on Vercel, but its proposed
`https://www.agent-machines.dev/__clerk` URL was not activated. Clerk's configured
primary domain is exactly the apex `agent-machines.dev`. The production UI
rejected the full `www` proxy URL, and the Backend API also rejected it with
`form_param_format_invalid`: **Cannot be on a different domain**. A Ready
deployment does not establish that Clerk accepts its proxy configuration.

That earlier web gate passed 1,679 tests with 37 skips and TypeScript, but did
not establish proxy activation. The corrected apex implementation and verified
operation at the top of this report supersede that rejected configuration.

## Initial inspection — historical

The later DNS and domain follow-up below supersedes the missing-DNS state and
`.com` public-host policy described at this initial checkpoint.

At 20:11 UTC, a fresh read of the exact Vercel Production project classified
both Clerk keys as production keys. No key values were printed. The configured
owner mapping also differs from the earlier development identity; this alone
does not prove that it points to the intended production user.

The live aliases serve deployment `dpl_8tNyVaV5Lf4ZV7pK6RdpCpkHgV5K`
(`agent-machines-2ggv7zbgk-kl01s-projects.vercel.app`), created at approximately
20:10:59 UTC. This supersedes the earlier development-key configuration evidence
in the launch-readiness report.

The owner explicitly confirmed `agent-machines.dev` as the intended production
Clerk domain. In the signed-in Clerk dashboard, that primary domain is still
**Unverified**, and certificates await DNS verification. Local DNS and an
independent Cloudflare DNS lookup returned `NXDOMAIN` for
`clerk.agent-machines.dev`. The live sign-in page reported
`failed_to_load_clerk_js` and displayed no authentication form.

The Clerk dashboard supplied these records for the `agent-machines.dev` zone:

| Type | Name | Target |
| --- | --- | --- |
| CNAME | `clerk` | `frontend-api.clerk.services` |
| CNAME | `accounts` | `accounts.clerk.services` |
| CNAME | `clkmail` | `mail.645hnkrgdo18.clerk.services` |
| CNAME | `clk._domainkey` | `dkim1.645hnkrgdo18.clerk.services` |
| CNAME | `clk2._domainkey` | `dkim2.645hnkrgdo18.clerk.services` |

No DNS record, certificate configuration, Clerk instance, user identity,
credential, or provider permission was changed during this inspection.

## Code-side corrections — deployed and browser-verified

Commit `2965f0d877a480ae2d49f7ba39a65a5321d1b285` was pushed to `origin/main`.
At 20:36 UTC, deployment `dpl_9M8FXTv7mjr8VQko6gx46F7Wy2XK`
(`agent-machines-dmdvxyvir-kl01s-projects.vercel.app`) was Production/Ready and
served both public domains. This deployment supersedes the one recorded above.

At that checkpoint, public marketing stayed on `.com`. Browser sign-in, onboarding, and dashboard
requests must use `https://www.agent-machines.dev` when the configured production
key belongs to this exact Clerk domain. This avoids trying to use a primary
Clerk instance across unrelated domains without satellite configuration.

The redirect must run before Clerk middleware; preserve the requested path and
query; leave API endpoints, POST requests, other hosts, and development keys
unchanged; and keep authentication return destinations relative and validated.
It must not redirect SDK authorization headers to another origin.

Sign-in now uses Clerk's supported loading, loaded, and failed controls. Failure
shows an accessible recovery message, a retry button that reloads the current
URL, and a home link. It does not expose raw errors, infer that an account was
created, or make a failed provider appear healthy. A degraded but usable Clerk
instance can still render the normal sign-in form.

## Release verification

The complete `pnpm check` passed after these changes: 863 SDK/source tests and
1,636 web tests, for 2,499 passing tests, with 37 explicit platform-specific
skips. Both TypeScript checks, the SDK and Next.js production builds, and
isolated tarball ESM/CommonJS consumption checks passed. `git diff --check` is
clean. The first full run caught a type mismatch in a new request test helper;
that helper was corrected and the entire gate rerun successfully.

Redirect regressions were reproduced before the fix and then passed with the
new host policy. Loading and failure tests likewise failed before the new
sign-in wrapper. Coverage includes fixed-host redirects, preserved paths and
queries, excluded methods and APIs, malformed or unrelated keys, Clerk's
loading/error/degraded/ready states, and reloading the unchanged URL on retry.
Independent review found no concrete security or functional blockers.

These checks verify the code-side behavior, not live OAuth registration, DNS,
or a completed production account flow. No authentication bypass was used.

### Rendered production verification

In the user's Chrome browser, opening
`https://www.agent-machines.com/sign-in?redirect_url=%2Fdashboard%2Fworkers`
landed on the corresponding `www.agent-machines.dev` URL with the query intact.
The loading indicator appeared, followed by the recovery message after Clerk's
script load failed. Screenshots and the rendered accessibility tree confirmed
the error heading, retry button, and home link in both light and dark themes.
Clicking **Try again** reloaded the same `.dev` sign-in URL without losing its
requested Worker destination.

The independent DNS lookup still returned `NXDOMAIN`. These checks demonstrate
recovery from an unavailable authentication service, not a successful login.
At that pre-approval checkpoint, provider creation forms and the Clerk DNS page
were retained for the owner; no credentials had been created or stored and no
forms had been submitted.

## Social login follow-up

After owner approval, Google, GitHub, and X / Twitter were configured with custom
production credentials. At 21:07 UTC, all three Clerk connections reported
**Used for sign-in**; legacy Twitter remained disabled. Google was published
for external users. See the [social login setup report](2026-09-09-social-login-setup.md)
for configuration evidence and the remaining live-login checks. Credentials
are not included in these reports.

At that checkpoint, Porkbun was signed out in Chrome, and the independent DNS
lookup still returned `NXDOMAIN`. The following DNS work supersedes that state;
social-provider configuration alone was not proof of a successful login.

### DNS and canonical-domain follow-up

After the owner signed in, the five CNAMEs above were added to the `.dev` zone
with TTL 600. Existing website records and nameservers were preserved. Public
DNS now resolves the new records, and Clerk reports the frontend API, account
portal, and all three email records **Verified**. By 21:30 UTC, both SSL
certificates were **Issued**. The versioned frontend browser script returned
200 over verified TLS using its publicly resolved IP.

The Mac's configured DNS resolver still returned `NXDOMAIN`, and Chrome still
showed the sign-in recovery state. No system DNS or VPN changes were made.
See the [social login follow-up](2026-09-09-social-login-setup.md) for the exact
verification boundary; this is not yet an actual OAuth callback test.

At the owner's request, Vercel now redirects both `.com` hosts to
`www.agent-machines.dev` with 308 responses across all paths. This supersedes
the earlier public-marketing/API exception at the domain level; authenticated
API clients should target `.dev` directly. The narrower code-side auth redirect
remains in place. See the [domain report](2026-09-09-domain-canonicalization.md).

### Initial preparation — historical

The user requested Google, GitHub, and X login using their signed-in Chrome
tabs. GitHub's unsubmitted registration form was corrected to the exact callback
shown by Clerk: `https://clerk.agent-machines.dev/v1/oauth_callback`. Its wildcard
and device-flow options remain disabled. X's unsubmitted creation form names
Agent Machines and selects Production in the existing pay-per-use project;
no credits were purchased and no billable API calls were made. Google project
`agent-machines` has no OAuth branding configuration yet; its setup form is open.

At this earlier checkpoint, creation of persistent OAuth credentials, storage
of provider secrets in Clerk, and Google's support/contact email awaited
action-time user confirmation. The approved configuration above supersedes
that preparation-only state; live login had not yet been verified then.

## Remaining launch proof

- The bounded ordinary-account UI/API isolation checks passed, including the
  existing operation journal and temporary SDK key revocation. All three
  configured social sign-in flows reached the authenticated production app.
- Confirm the intended production owner mapping; do not infer automatic
  migration of development users, keys, or Worker ownership.

The tested GitHub account-to-completed-Worker-and-artifact flow, subsequent
Google/X login, bounded second-account UI/API isolation, and approved QA
administrator cleanup passed. The recovered chats 502's cause and an exhaustive
authorization audit remain outside that success claim.
