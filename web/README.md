# Hermes Persistent -- Web UI

Next.js 15 + Tailwind v4 chat UI for the deployed Hermes Agent. Built on the Reticle / Sigil design system (engineering-instrument aesthetic: visible grid, margin rails, cross marks).

## Quick start

After running `npm run deploy` from the repo root and getting the API URL + key:

```bash
cd web
cp .env.local.example .env.local
# paste HERMES_API_URL and HERMES_API_KEY from `npm run deploy` output
npm install
npm run dev
```

Open [http://localhost:3210](http://localhost:3210).

## What's here

- `app/page.tsx` -- the landing page (hero, chat, capabilities, skills, architecture).
- `app/api/chat/route.ts` -- server-side SSE proxy to the Hermes API. The bearer token never reaches the browser.
- `app/api/health/route.ts` -- `/v1/models` probe. Used by the chat to render the "online" badge.
- `components/Chat.tsx` -- streaming chat with starter prompts, abort, and markdown.
- `components/reticle/` -- ported Reticle design system primitives (page grid, cross marks, gutters, margins, cards, buttons, badges, labels).

## Why not embed the Hermes dashboard?

Hermes ships its own React dashboard at port 9119 -- exposed via Dedalus preview during deploy. That dashboard is great for managing config and viewing sessions, but it's full of admin chrome that doesn't fit a public landing page. This UI is a thin polished frontend over the API, complementary to (not replacing) the dashboard.

## Why server-side proxy?

`HERMES_API_KEY` is a real bearer token. If we exposed it as `NEXT_PUBLIC_*`, every visitor could read it from JS and call the agent themselves. The API route lives on the server; the token never leaves it.
