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

## Codex on a gateway: needs the Responses API, not chat completions

Three findings, each measured:

1. **Codex ignores `OPENAI_BASE_URL`.** Set it to a local listener and the
   CLI never connected; it went to `https://api.openai.com/v1/responses`
   and failed with a 401 on the OpenRouter key. The env var is not the
   knob.
2. **The knob is a config-file provider**, `~/.codex/config.toml`:

   ```toml
   model_provider = "openrouter"
   model = "anthropic/claude-sonnet-4.5"

   [model_providers.openrouter]
   name = "openrouter"
   base_url = "https://openrouter.ai/api/v1"
   env_key = "OPENROUTER_API_KEY"
   wire_api = "responses"
   ```

3. **`wire_api = "chat"` is rejected by codex 0.146**: "no longer
   supported. How to fix: set `wire_api = \"responses\"`". So a gateway
   must serve the OpenAI *Responses* API, not just chat completions. Both
   do (verified HTTP 200, `object: "response"`):
   `https://openrouter.ai/api/v1/responses` and
   `https://ai-gateway.vercel.sh/v1/responses`.

With that config the request reaches the right URL and API on both
gateways and is refused only for account credit -- OpenRouter 402
("requested up to 64000 tokens, but can only afford 2476") and Vercel
("a positive credit balance is required for all requests, including
BYOK"). So the wiring is proven; the run is not.

`model_max_output_tokens = 2000` in config.toml did NOT change the
requested ceiling (still 64000). The section below explains why, and it is
not the answer the earlier note assumed.

## The output-token ceiling is the gateway's, not a Codex setting

Measured 2026-08-01 against the codex 0.146.0 binary itself
(`@openai/codex-darwin-arm64` vendored `bin/codex`) plus one live
OpenRouter call. There is **no Codex-side output-token cap knob**, and
there cannot be one, because Codex never sends the field.

**1. Codex 0.146 sends no output-token field at all.** A local HTTP
listener stood in for the gateway (`base_url =
"http://127.0.0.1:8799/v1"`, `wire_api = "responses"`) and the POSTed body
was captured verbatim. Top-level keys, for three different models:

| model | request keys |
| --- | --- |
| `gpt-5.3-codex` (fallback metadata) | model, instructions, input, tools, tool_choice, parallel_tool_calls, reasoning, store, stream, include, prompt_cache_key, client_metadata |
| `gpt-5.6-sol` (in the catalog) | model, input, text, tool_choice, parallel_tool_calls, reasoning, store, stream, include, prompt_cache_key, client_metadata |
| `anthropic/claude-sonnet-4.5` (the gateway slug from the 402 above) | model, instructions, input, tools, tool_choice, parallel_tool_calls, reasoning, store, stream, include, prompt_cache_key, client_metadata |

Neither `max_output_tokens` nor `max_tokens` appears in any of them. So no
config value could have shrunk the request: there was nothing to shrink.

**2. `model_max_output_tokens` is not a Codex config field.** 0.146 has
`--strict-config` ("Error out when config.toml contains fields that are
not recognized by this version of Codex"), which turns this from a guess
into a check. Every candidate name was put in `config.toml` and run
through `codex exec --strict-config`:

| key | verdict |
| --- | --- |
| `model_max_output_tokens` | unknown configuration field |
| `max_output_tokens` | unknown configuration field |
| `model_output_token_limit` | unknown configuration field |
| `output_token_limit` | unknown configuration field |
| `max_tokens` | unknown configuration field |
| `model_max_tokens` | unknown configuration field |
| `max_completion_tokens` | unknown configuration field |
| `tool_output_token_limit` | accepted -- but it truncates TOOL output, not the model request |

The `ConfigToml` field list in the binary agrees: the model-shaped keys are
`model`, `review_model`, `model_provider`, `model_context_window`,
`model_auto_compact_token_limit`, `model_reasoning_effort`,
`model_verbosity`, `model_catalog_json` and friends. Nothing about output
tokens. Same for the per-model `ModelInfo` record, which carries
`context_window`, `max_context_window` and `auto_compact_token_limit` and
no output ceiling.

**3. The 64000 is OpenRouter's, and a request-level cap does fix it.**
Same key, same small balance, same endpoint, one field different:

```bash
# no max_output_tokens -> 402
curl -s https://openrouter.ai/api/v1/responses \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"anthropic/claude-sonnet-4.5","input":"say OK","store":false}'
# {"error":{"message":"This request requires more credits, or fewer max_tokens.
#  You requested up to 64000 tokens, but can only afford 2476", "code":402, ...}}

# max_output_tokens: 64 -> HTTP 200, status "completed", output "OK"
curl -s https://openrouter.ai/api/v1/responses \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"anthropic/claude-sonnet-4.5","input":"say OK","store":false,"max_output_tokens":64}'
```

So when the field is omitted OpenRouter reserves the model's own maximum
output (64000 for claude-sonnet-4.5) and refuses on balance. That is why
the number never moved: it was never Codex's number.

**Consequence for routing.** Codex on a metered gateway needs real credit,
or a model whose own output ceiling fits the balance. Do NOT add
`-c model_max_output_tokens=...` to the harness: the name is not a config
field (measured in `config.toml`; the `-c` form was not tested separately,
and it does not matter, because there is no wire field for it to reach).
`src/mux/harnesses/codex.test.ts` has a guard test so the invented knob
cannot come back. This is the one place Codex differs from Claude Code,
which does send a ceiling and does honor `CLAUDE_CODE_MAX_OUTPUT_TOKENS`.

Not established: whether some *other* release of Codex sends the field, and
whether a gateway account setting can impose a default cap server-side.
Neither was tested.

## A vck_ AI Gateway key IS a model upstream

Worth separating from the earlier finding that it is not *sandbox* auth:
the `vck_` key authenticates fine against
`https://ai-gateway.vercel.sh/v1/responses`. So one key can be useless for
provisioning and useful for inference at the same time, which is exactly
why the two credential roles must stay distinct in config.

## Still unverified

- Vercel AI Gateway's Anthropic-Messages endpoint against claude-code
  (only its Responses endpoint has been exercised).
- Whether OpenClaw and Hermes honor a base-URL override at all.
- ~~The Codex output-token cap knob.~~ **CLOSED as "there is none"** -- see
  "The output-token ceiling is the gateway's, not a Codex setting". What
  stays unverified is narrower: whether a non-0.146 Codex sends the field,
  and whether a gateway account setting can cap it server-side.
