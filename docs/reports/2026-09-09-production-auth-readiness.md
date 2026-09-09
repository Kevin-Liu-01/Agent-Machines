# Production authentication follow-up — September 9, 2026

## Changed production state

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

Public marketing stays on `.com`. Browser sign-in, onboarding, and dashboard
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
Provider creation forms and the Clerk DNS page were retained for the owner;
no credentials were created or stored and no forms were submitted.

## Social login preparation, not completion

The user requested Google, GitHub, and X login using their signed-in Chrome
tabs. GitHub's unsubmitted registration form was corrected to the exact callback
shown by Clerk: `https://clerk.agent-machines.dev/v1/oauth_callback`. Its wildcard
and device-flow options remain disabled. X's unsubmitted creation form names
Agent Machines and selects Production in the existing pay-per-use project;
no credits were purchased and no billable API calls were made. Google project
`agent-machines` has no OAuth branding configuration yet; its setup form is open.

Creation of persistent OAuth credentials, storing provider secrets in Clerk,
and Google's support/contact email are awaiting the requested action-time user
confirmation. No provider has been declared configured or login-tested.

## Remaining launch proof

- Verify the Clerk DNS records and certificates for the confirmed `.dev` domain.
- Complete the approved provider registrations and Clerk connections with only
  the permissions required for sign-in.
- Confirm the intended production owner mapping; do not infer automatic
  migration of development users, keys, or Worker ownership.
- Exercise a fresh production account through onboarding, credential setup,
  Worker creation, a completed real task, and inspection of its output.
- Complete the separately requested, still-pending QA administrator cleanup.

This report is not a declaration that production authentication or the complete
new-account-to-completed-Worker flow is working.
