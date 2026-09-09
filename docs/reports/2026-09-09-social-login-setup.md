# Social login setup — September 9, 2026

Following owner approval, provider setup proceeded in the owner's signed-in
Chrome tabs. This checkpoint supersedes the preparation-only social-login
section of the [production authentication report](2026-09-09-production-auth-readiness.md).
It records configuration evidence, not successful OAuth login or a completed
fresh-account flow. Application code remained at `1c170bc` before this report.

## Observed Clerk status

The production Clerk SSO table was reread at 21:07 UTC:

| Connection | Dashboard status |
| --- | --- |
| Google | Used for sign-in |
| X / Twitter | Used for sign-in |
| GitHub | Used for sign-in |
| Legacy Twitter | Disabled |

## Google

Project `agent-machines` now has an external Web client named
`Agent Machines — Production`. Its authorized JavaScript origins are
`https://www.agent-machines.dev` and `https://agent-machines.dev`; the redirect
URI is exactly `https://clerk.agent-machines.dev/v1/oauth_callback`.

The approved support/contact email is configured but omitted here. Branding
uses homepage, privacy, and terms links on `www.agent-machines.dev`, with
`agent-machines.dev` as the authorized root domain. The Google Audience page
reports **In production**. Only the required identity scopes were configured.
The resulting connection is stored in Clerk and shown as used for sign-in;
this does not establish a successful Google authentication flow.

## X / Twitter

App `33417736` already existed in the owner's tab; this setup did not create
that app. Its authentication settings were configured for Read permissions,
the confidential Web App type, the exact Clerk callback above, and the
application's policy links.

OAuth 2 client credentials were generated and stored in Clerk. The connection
requires `users.read`, `tweet.read`, `offline.access`, and `users.email`; no
additional scopes, write permissions, or direct-message permissions were added.
The initial OAuth 1 and Bearer values were not used for the Clerk connection.

No paid API tests or credit purchases were performed. A future X login may
involve a paid profile read; the configured connection is not evidence of a
completed or cost-free login.

## GitHub

OAuth app `3847965` was created with the exact Clerk callback above. Wildcard
callbacks and device flow remain disabled. The GitHub Mobile security check
succeeded, after which a client secret was generated, transferred directly to
production Clerk, and saved. The only configured scopes are the required
`user:email` and `read:user`. Clerk now reports **Used for sign-in**.

The saved-secret X OAuth 2 modal was closed, and GitHub was navigated back to
settings to hide its one-time secret. The original X initial-keys dialog from
the owner's existing setup was retained for the owner.

## Remaining blockers and proof

All five Clerk DNS records remain **Unverified**, as listed in the
[production authentication report](2026-09-09-production-auth-readiness.md).
An independent `dig @1.1.1.1` lookup still returned `NXDOMAIN` for
`clerk.agent-machines.dev` at 21:07 UTC.
Porkbun is signed out in Chrome, and the owner has been asked to sign in.
DNS verification and certificate readiness have not been established.

The next required steps are owner Porkbun sign-in, completion of DNS and
certificate verification, then actual production login verification. No OAuth
login, fresh-account onboarding, or new-account-to-completed-Worker proof was
completed at this checkpoint. No paid API tests were performed.

No credentials were saved in the repository. This report contains no secrets
or private contact data.
