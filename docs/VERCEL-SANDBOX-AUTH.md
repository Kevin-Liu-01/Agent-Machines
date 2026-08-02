# Getting Vercel Sandbox credentials

Vercel Sandbox is the one substrate that cannot be unlocked by pasting a key
from a dashboard page, which is why it stayed `skipped` in the matrix while E2B,
Sprites and Dedalus went green. This is the whole procedure, and the part only
you can do is marked.

## What the provider accepts

`src/mux/providers/vercel.ts` takes either shape and fails closed with the
missing names if neither is complete:

1. **OIDC token** -- `VERCEL_OIDC_TOKEN` alone. The SDK reads `projectId` and
   `teamId` out of the JWT claims, so no other variable is needed. It expires
   after 12 hours, which is fine for a test run and wrong for a deployment.
2. **Access token triple** -- `VERCEL_TOKEN` + `VERCEL_TEAM_ID` +
   `VERCEL_PROJECT_ID`. Does not expire on a timer, so this is the one to use
   for anything that runs unattended.

A `vck_` key is rejected on sight with an explanation: that is an AI Gateway
key, which authenticates *inference* and not *provisioning*. Both roles are
real and they are not interchangeable -- see docs/UPSTREAMS.md, where the same
`vck_` key works fine as a model upstream.

## Option 1: OIDC, fastest (12-hour token)

```bash
npm i -g vercel
vercel login          # <- ONLY YOU CAN DO THIS: it opens a browser
vercel link           # pick the team and the project backing this repo
vercel env pull web/.env.local
```

`vercel env pull` writes `VERCEL_OIDC_TOKEN` into `web/.env.local`. The mux
config reads it from the environment, so:

```bash
set -a && source web/.env.local && set +a
npx tsx scripts/mux-live-test.ts --sandboxes vercel
```

## Option 2: access token triple, durable

**Only you can do the first step:** create a token at
<https://vercel.com/account/settings/tokens> (Account Settings -> Tokens ->
Create), scoped to the team that owns the project.

Then, with that token in `$VT`:

```bash
# team id -- the CLI config already records the current one
python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/Library/Application Support/com.vercel.cli/config.json')))['currentTeam'])"

# project id
curl -s "https://api.vercel.com/v9/projects?teamId=$TEAM&limit=20" \
  -H "Authorization: Bearer $VT" | python3 -c "
import json,sys
for p in json.load(sys.stdin).get('projects', []): print(p['id'], p['name'])"
```

Add all three to the gitignored `.env` at the repo root:

```
VERCEL_TOKEN=...
VERCEL_TEAM_ID=team_...
VERCEL_PROJECT_ID=prj_...
```

## Why this is not automated

Creating an account credential is not something an agent should do on your
behalf, and both paths start with exactly that: `vercel login` is a browser
OAuth consent, and a dashboard token is a click-through you own. So the harness
is wired and waiting rather than half-guessing.

## State of the local machine, checked 2026-08-02

There IS a Vercel CLI credential store at
`~/Library/Application Support/com.vercel.cli/auth.json` with a `vca_` token and
`currentTeam: team_KpAxFhYN63bKUy7bj8bNoOkh` in `config.json`. **The token is
expired** -- `GET /v2/user` returns HTTP 403 `{"code":"forbidden",
"invalidToken":true}` and the recorded `expiresAt` maps to 2026-07-25. A
`refreshToken` sits beside it, but exchanging it is authenticating as you, so it
was left alone.

Once either option above is done, the matrix closes the last 4 of 16 cells with
no code changes -- the provider, its capability declarations and its no-wake
lifecycle are already implemented and unit-tested. What is missing is a
credential, not an implementation.
