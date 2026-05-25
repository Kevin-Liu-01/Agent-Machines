#!/usr/bin/env bash
# Verify agent × provider matrix against local dashboard (ALLOW_DEV_AUTH=1).
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3210}"
BOOT_TIMEOUT="${BOOT_TIMEOUT:-900}"
CHAT_TIMEOUT="${CHAT_TIMEOUT:-90}"
EXEC_TIMEOUT="${EXEC_TIMEOUT:-130}"
RESULTS="${RESULTS_FILE:-/tmp/agent-provider-matrix.jsonl}"

PROVIDERS=(e2b sprites dedalus)
AGENTS=(hermes openclaw claude-code codex)

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

provision() {
  local provider="$1" agent="$2"
  curl -s -X POST "$BASE/api/dashboard/admin/provision-machine" \
    -H "Content-Type: application/json" \
    -d "{\"providerKind\":\"$provider\",\"agentKind\":\"$agent\",\"name\":\"matrix-$provider-$agent\"}"
}

bootstrap() {
  local mid="$1"
  curl -s -X POST "$BASE/api/dashboard/admin/bootstrap" \
    -H "Content-Type: application/json" \
    -d "{\"machineId\":\"$mid\",\"force\":true}" --max-time "$BOOT_TIMEOUT"
}

find_machine() {
  local provider="$1" agent="$2"
  python3 - "$provider" "$agent" <<'PY'
import json, sys
provider, agent = sys.argv[1], sys.argv[2]
with open("web/.dev-user-config.json") as f:
    cfg = json.load(f)
candidates = [m for m in cfg.get("machines", []) if m.get("providerKind") == provider and m.get("agentKind") == agent]
for m in sorted(candidates, key=lambda x: x.get("bootstrapState", {}).get("phase") != "succeeded"):
    if m.get("bootstrapState", {}).get("phase") == "succeeded":
        print(m["id"])
        sys.exit(0)
if candidates:
    print(candidates[-1]["id"])
PY
}

verify_gateway() {
  local mid="$1"
  curl -s "$BASE/api/dashboard/gateway?machineId=$mid"
}

verify_chat() {
  local mid="$1"
  curl -s -N -X POST "$BASE/api/chat" -H "Content-Type: application/json" \
    -d "{\"machineId\":\"$mid\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with one word: ok\"}]}" \
    --max-time "$CHAT_TIMEOUT" | rg -o '"content":"[^"]*"' | head -1 || true
}

verify_cli() {
  local mid="$1" agent="$2"
  local cli="claude"
  [ "$agent" = "codex" ] && cli="codex"
  curl -s -X POST "$BASE/api/dashboard/exec" -H "Content-Type: application/json" \
    -d "{\"machineId\":\"$mid\",\"command\":\"source ~/.agent-machines/.agent-env 2>/dev/null; $cli --version\",\"timeoutMs\":120000}" \
    --max-time "$EXEC_TIMEOUT"
}

verify_cursor() {
  local mid="$1"
  curl -s -X POST "$BASE/api/dashboard/exec" -H "Content-Type: application/json" \
    -d "{\"machineId\":\"$mid\",\"command\":\"if test -s ~/.agent-machines/cursor/.configured; then echo cursor:configured; elif test -f ~/.agent-machines/cursor/.disabled; then echo cursor:disabled; else echo cursor:missing; fi\",\"timeoutMs\":60000}" \
    --max-time 90
}

wake_machine() {
  local mid="$1"
  curl -s -X POST "$BASE/api/dashboard/machines/${mid}/wake" --max-time 120 >/dev/null || true
}

record() {
  local line="$1"
  echo "$line" >> "$RESULTS"
  log "$line"
}

run_cell() {
  local provider="$1" agent="$2"
  local key="${provider}/${agent}"
  log "=== $key ==="

  local mid
  mid=$(find_machine "$provider" "$agent" || true)
  if [ -z "$mid" ]; then
    local prov
    prov=$(provision "$provider" "$agent")
    mid=$(echo "$prov" | python3 -c "import json,sys; print(json.load(sys.stdin).get('machineId',''))")
    if [ -z "$mid" ]; then
      record "{\"cell\":\"$key\",\"ok\":false,\"stage\":\"provision\",\"error\":\"no machineId\"}"
      return
    fi
  fi

  wake_machine "$mid"
  sleep 3

  # E2B sandboxes expire; reprovision when wake fails.
  if [ "$provider" = "e2b" ]; then
    local wake_ok
    wake_ok=$(curl -s -X POST "$BASE/api/dashboard/machines/${mid}/wake" --max-time 120 | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok',False))" 2>/dev/null || echo False)
    if [ "$wake_ok" != "True" ]; then
      local prov
      prov=$(provision "$provider" "$agent")
      mid=$(echo "$prov" | python3 -c "import json,sys; print(json.load(sys.stdin).get('machineId',''))")
      phase="unknown"
      if [ -z "$mid" ]; then
        record "{\"cell\":\"$key\",\"ok\":false,\"stage\":\"provision\",\"error\":\"e2b sandbox expired; reprovision failed\"}"
        return
      fi
      wake_machine "$mid"
      sleep 5
    fi
  fi

  local phase
  phase=$(python3 - "$mid" <<'PY'
import json, sys
mid = sys.argv[1]
with open("web/.dev-user-config.json") as f:
    cfg = json.load(f)
for m in cfg.get("machines", []):
    if m["id"] == mid:
        print(m.get("bootstrapState", {}).get("phase", "unknown"))
        break
PY
)

  if [ "$phase" != "succeeded" ] || [ "${FORCE_BOOTSTRAP:-0}" = "1" ]; then
    local boot
    boot=$(bootstrap "$mid")
    local ok
    ok=$(echo "$boot" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok',False))")
    if [ "$ok" != "True" ]; then
      msg=$(echo "$boot" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('message',d.get('error',''))[:240])")
      record "{\"cell\":\"$key\",\"machineId\":\"$mid\",\"ok\":false,\"stage\":\"bootstrap\",\"error\":$(echo "$msg" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}"
      return
    fi
  fi

  local cursor
  cursor=$(verify_cursor "$mid" 2>/dev/null || echo '{"stdout":""}')
  local cursor_ok
  cursor_ok=$(echo "$cursor" | python3 -c "import json,sys; d=json.load(sys.stdin); o=d.get('stdout',''); print('true' if 'cursor:' in o else 'false')" 2>/dev/null || echo false)

  if [ "$agent" = "hermes" ] || [ "$agent" = "openclaw" ]; then
    local gw
    gw=$(verify_gateway "$mid")
    local status
    status=$(echo "$gw" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status',''))")
    if [ "$status" != "200" ]; then
      curl -s -X POST "$BASE/api/dashboard/admin/finalize-gateway" \
        -H "Content-Type: application/json" \
        -d "{\"machineId\":\"$mid\"}" --max-time 180 >/dev/null || true
      sleep 5
      gw=$(verify_gateway "$mid")
      status=$(echo "$gw" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status',''))")
    fi
    if [ "$status" != "200" ]; then
      record "{\"cell\":\"$key\",\"machineId\":\"$mid\",\"ok\":false,\"stage\":\"gateway\",\"status\":$status,\"cursor\":$cursor_ok}"
      return
    fi
    local chat
    chat=$(verify_chat "$mid")
    record "{\"cell\":\"$key\",\"machineId\":\"$mid\",\"ok\":true,\"gateway\":200,\"chat\":$(echo "$chat" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))'),\"cursor\":$cursor_ok}"
  else
    local exec_out
    exec_out=$(verify_cli "$mid" "$agent")
    local code
    code=$(echo "$exec_out" | python3 -c "import json,sys; print(json.load(sys.stdin).get('exitCode',1))")
    local ver
    ver=$(echo "$exec_out" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("stdout","").strip()[:80])')
    if [ "$code" = "0" ]; then
      record "{\"cell\":\"$key\",\"machineId\":\"$mid\",\"ok\":true,\"version\":$(echo "$ver" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),\"cursor\":$cursor_ok}"
    else
      err=$(echo "$exec_out" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("stderr","")[:200])')
      record "{\"cell\":\"$key\",\"machineId\":\"$mid\",\"ok\":false,\"stage\":\"exec\",\"exitCode\":$code,\"error\":$(echo "$err" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),\"cursor\":$cursor_ok}"
    fi
  fi
}

: > "$RESULTS"
cd "$(dirname "$0")/.."

for provider in "${PROVIDERS[@]}"; do
  for agent in "${AGENTS[@]}"; do
    run_cell "$provider" "$agent" || true
  done
done

log "=== SUMMARY ==="
python3 - <<PY
import json
from pathlib import Path
rows = [json.loads(l) for l in Path("$RESULTS").read_text().splitlines() if l.strip()]
ok = sum(1 for r in rows if r.get("ok"))
print(f"{ok}/{len(rows)} cells passed")
for r in rows:
    mark = "PASS" if r.get("ok") else "FAIL"
    print(f"  [{mark}] {r.get('cell')} {r.get('stage','') or ''} {r.get('error','')[:60] if not r.get('ok') else ''}")
PY
