# Model upstreams: what actually drives each harness

Every claim here was verified against the live API on 2026-08-01 with
`curl`, not read from documentation. Re-verify with the commands shown
before trusting any of it after a vendor change.

## OpenRouter serves BOTH wire formats

This is the finding that matters most, and it contradicts the common
assumption that OpenRouter is OpenAI-shaped only.

**Anthropic Messages shape** (this is what Claude Code speaks):

```
POST https://openrouter.ai/api/v1/messages
  anthropic-version: 2023-06-01
  auth: x-api-key: sk-or-v1-...   OR   Authorization: Bearer sk-or-v1-...
  {"model":"anthropic/claude-sonnet-4.5","max_tokens":10,"messages":[...]}
```

Returned HTTP 200 with genuine Anthropic shape:

```json
{"id":"gen-...","type":"message","role":"assistant",
 "content":[{"type":"text","text":"OK","citations":[]}],
 "model":"anthropic/claude-sonnet-4.5","stop_reason":"end_turn"}
```

Both auth header styles returned 200, so either works.

**OpenAI Chat Completions shape** (this is what Codex speaks):

```
POST https://openrouter.ai/api/v1/chat/completions
  Authorization: Bearer sk-or-v1-...
```

Returned a normal `chat.completion` object (observed provider: Amazon
Bedrock for an Anthropic model, which is OpenRouter's routing at work).

## Consequence for routing

A single OpenRouter key can therefore drive both `claude-code` (via
`ANTHROPIC_BASE_URL`) and `codex` (via `OPENAI_BASE_URL`). That is
strictly more capable than the native-key-only rule the router shipped
with, which rejected gateway-only configs outright.

## The trap: model ids are namespaced per upstream

A gateway does not accept native model ids. OpenRouter wants
provider-prefixed ids (`anthropic/claude-sonnet-4.5`), while a native
Anthropic key wants `claude-sonnet-4-5`. Sending a native id to a gateway
is a silent 404 at request time -- long after routing "succeeded" -- so
the upstream layer must either normalize the id per chosen upstream or
refuse to guess. Never send an unmapped id and hope.

## Verification commands

```bash
# key is live and shows quota
curl -s https://openrouter.ai/api/v1/key -H "Authorization: Bearer $OPENROUTER_API_KEY"

# Anthropic Messages shape (claude-code path)
curl -s https://openrouter.ai/api/v1/messages \
  -H "x-api-key: $OPENROUTER_API_KEY" -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"model":"anthropic/claude-sonnet-4.5","max_tokens":10,"messages":[{"role":"user","content":"say OK"}]}'

# OpenAI shape (codex path)
curl -s https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"anthropic/claude-sonnet-4.5","messages":[{"role":"user","content":"say OK"}],"max_tokens":10}'
```

## Claude Code on OpenRouter: the verified recipe

Proven end-to-end in a live E2B sandbox: `is_error: false`,
`result: "OR-OK"`, cost $0.008448, `modelUsage: ["anthropic/claude-sonnet-4.5"]`.

```
ANTHROPIC_BASE_URL=https://openrouter.ai/api      # NOT .../api/v1
ANTHROPIC_AUTH_TOKEN=sk-or-v1-...                 # ANTHROPIC_API_KEY also works
CLAUDE_CODE_MAX_OUTPUT_TOKENS=2000                # see credit note below
IS_SANDBOX=1
claude --bare -p "..." --model anthropic/claude-sonnet-4.5
```

### The base-URL trap, measured

Claude Code appends `/v1/messages?beta=true` to `ANTHROPIC_BASE_URL`. This
was measured by pointing the CLI at a local HTTP listener inside a sandbox
and logging the paths it requested:

| `ANTHROPIC_BASE_URL` | path actually requested | verdict |
| --- | --- | --- |
| `http://host` | `/v1/messages?beta=true` | wrong host prefix for OpenRouter |
| `http://host/api` | `/api/v1/messages?beta=true` | **correct** |
| `http://host/api/v1` | `/api/v1/v1/messages?beta=true` | doubled `/v1`, 404 |

So the intuitive `https://openrouter.ai/api/v1` (the value that works for
raw curl) is exactly the value that FAILS for Claude Code, and it fails as
a model-not-found 404 rather than anything that names the real problem.
The CLI also probes `HEAD <base>/api/hello`, which OpenRouter 404s
harmlessly.

### Output-token ceiling vs account credits

Claude Code requests up to 32000 output tokens by default. On a
low-balance OpenRouter account that returns:

```
402 This request requires more credits, or fewer max_tokens. You requested
up to 32000 tokens, but can only afford 2589.
```

That is a billing signal, not a wiring fault -- the request reached the
model. `CLAUDE_CODE_MAX_OUTPUT_TOKENS` caps it. Any upstream layer routing
Claude Code through a metered gateway should set a ceiling rather than let
the default 32000 fail every request on a small balance.

## Still unverified

- Vercel AI Gateway's Anthropic-compatible endpoint (a `vck_` key is
  present but has not been exercised against a harness).
- Codex against OpenRouter via `OPENAI_BASE_URL` end-to-end (the raw
  `/api/v1/chat/completions` call works, but the CLI's own path
  construction has not been measured the way Claude Code's was -- assume
  nothing).
- Whether OpenClaw and Hermes honor a base-URL override at all.
