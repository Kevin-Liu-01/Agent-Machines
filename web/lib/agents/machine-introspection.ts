/**
 * Agent-agnostic machine introspection.
 *
 * Detects which agent runtime is active (Hermes, OpenClaw, Claude Code,
 * Codex CLI) and queries the appropriate paths/state for each. The
 * console renders the same panel structure regardless of agent -- the
 * data model normalizes across runtimes.
 *
 * Data sources per agent:
 *   Hermes:     ~/.agent-machines/ (config.yaml, SOUL.md, MEMORY.md, USER.md, skills/, cron/, profiles/)
 *   OpenClaw:   ~/.openclaw/ (AGENTS.md, SOUL.md, IDENTITY.md, USER.md, MEMORY.md, memory/, skills/, sessions/)
 *   Claude Code: ~/.claude/ + project CLAUDE.md
 *   Codex CLI:  ~/.codex/config.toml
 */

import type { AgentKind } from "@/lib/user-config/schema";

const HOME = "/home/machine";

export type MemoryFile = {
	name: string;
	path: string;
	chars: number;
	limit: number | null;
	percent: number | null;
};

export type SkillSummary = {
	total: number;
	agentAuthored: number;
	bundled: number;
	stale: number;
	archived: number;
	pinned: string[];
};

export type CuratorStatus = {
	available: boolean;
	lastRun: string | null;
};

export type GepaStatus = {
	available: boolean;
	lastRun: string | null;
	optimizedSkills: number;
};

export type AgentProfile = {
	name: string;
	agentKind: AgentKind;
	model: string;
	soulPreview: string;
	skillCount: number;
	hasGateway: boolean;
	hasTelegram: boolean;
	hasHeartbeat: boolean;
	sandboxMode: string | null;
	approvalPolicy: string | null;
};

export type SessionStats = {
	totalSessions: number;
	totalTranscripts: number;
	oldestSession: string | null;
};

export type HeartbeatStatus = {
	enabled: boolean;
	intervalMinutes: number | null;
	lastRun: string | null;
	hasChecklist: boolean;
};

export type VectorMemoryStatus = {
	available: boolean;
	indexedFiles: number;
	embeddingProvider: string | null;
};

export type ChannelBridge = {
	name: string;
	connected: boolean;
};

export type SubAgentStatus = {
	available: boolean;
	maxConcurrent: number;
	activeCount: number;
};

export type MachineIntrospection = {
	detectedAgent: AgentKind | "unknown";
	agentVersion: string | null;
	model: string | null;
	identity: MemoryFile[];
	memory: MemoryFile[];
	skills: SkillSummary;
	curator: CuratorStatus;
	gepa: GepaStatus;
	profiles: AgentProfile[];
	sessions: SessionStats;
	heartbeat: HeartbeatStatus;
	vectorMemory: VectorMemoryStatus;
	channels: ChannelBridge[];
	subAgents: SubAgentStatus;
	sandboxMode: string | null;
	approvalPolicy: string | null;
	configPath: string | null;
};

export type HermesProfile = AgentProfile;

/**
 * Single bash command that detects the agent and reads all state.
 * Runs in ~2-5s on a warm machine.
 */
export const INTROSPECTION_COMMAND = `
set -e

runtime="${HOME}/.agent-machines"
if [ ! -d "$runtime" ] && [ -d ${HOME}/.hermes ]; then runtime="${HOME}/.hermes"; fi

echo "===DETECT==="
agent="unknown"
agent_version=""
agent_model=""
config_path=""

if command -v hermes >/dev/null 2>&1 && [ -d "$runtime" ]; then
  agent="hermes"
  agent_version=$(hermes --version 2>/dev/null | head -1 || echo "")
  config_path="$runtime/config.yaml"
  if [ -f "$config_path" ]; then agent_model=$(grep -m1 'default:' "$config_path" 2>/dev/null | awk '{print $2}'); fi
elif [ -d ${HOME}/.openclaw ] && (command -v openclaw >/dev/null 2>&1 || [ -f ${HOME}/.openclaw/config.json ]); then
  agent="openclaw"
  agent_version=$(openclaw --version 2>/dev/null | head -1 || echo "")
  config_path="${HOME}/.openclaw/config.json"
elif [ -d ${HOME}/.claude ] || command -v claude >/dev/null 2>&1; then
  agent="claude-code"
  agent_version=$(claude --version 2>/dev/null | head -1 || echo "")
  config_path="${HOME}/.claude/settings.json"
elif [ -d ${HOME}/.codex ] || command -v codex >/dev/null 2>&1; then
  agent="codex"
  agent_version=$(codex --version 2>/dev/null | head -1 || echo "")
  config_path="${HOME}/.codex/config.toml"
fi
echo "agent=$agent"
echo "version=$agent_version"
echo "model=$agent_model"
echo "config=$config_path"

echo "===IDENTITY==="
for f in SOUL.md AGENTS.md IDENTITY.md TOOLS.md HEARTBEAT.md CLAUDE.md; do
  for d in "$runtime" ${HOME}/.openclaw ${HOME}/.openclaw/workspace ${HOME}/.claude ${HOME}; do
    if [ -f "$d/$f" ]; then
      chars=$(wc -c < "$d/$f")
      echo "file=$f|path=$d/$f|chars=$chars"
      break
    fi
  done
done

echo "===MEMORY==="
for f in MEMORY.md USER.md; do
  for d in "$runtime" "$runtime/memories" ${HOME}/.openclaw ${HOME}/.openclaw/workspace; do
    if [ -f "$d/$f" ]; then
      chars=$(wc -c < "$d/$f")
      echo "file=$f|path=$d/$f|chars=$chars"
      break
    fi
  done
done
# OpenClaw daily logs
if [ -d ${HOME}/.openclaw/workspace/memory ]; then
  daily_count=$(find ${HOME}/.openclaw/workspace/memory -name '*.md' 2>/dev/null | wc -l)
  echo "daily_logs=$daily_count"
fi

echo "===SKILLS==="
skills_dir=""
if [ -d "$runtime/skills" ]; then skills_dir="$runtime/skills"; fi
if [ -d ${HOME}/.openclaw/skills ]; then skills_dir="${HOME}/.openclaw/skills"; fi
if [ -n "$skills_dir" ]; then
  total=$(find "$skills_dir" -maxdepth 2 -name 'SKILL.md' 2>/dev/null | wc -l)
  agent_authored=$(find "$skills_dir" -maxdepth 2 -name 'SKILL.md' -exec grep -l 'author: agent' {} \\; 2>/dev/null | wc -l)
  stale=$(find "$skills_dir" -maxdepth 2 -name '.stale' 2>/dev/null | wc -l)
  archived=$(find "$skills_dir/.archive" -type f -name 'SKILL.md' 2>/dev/null | wc -l)
  pinned=""
  if [ -f "$skills_dir/.pinned" ]; then pinned=$(cat "$skills_dir/.pinned" 2>/dev/null | tr '\\n' ','); fi
  echo "total=$total"
  echo "agent_authored=$agent_authored"
  echo "stale=$stale"
  echo "archived=$archived"
  echo "pinned=$pinned"
else
  echo "total=0"
fi

echo "===CURATOR==="
last_curator=""
if [ -f "$runtime/skills/.curator-last-run" ]; then last_curator=$(cat "$runtime/skills/.curator-last-run"); fi
echo "available=$([ -n "$last_curator" ] || [ "$agent" = "hermes" ] && echo 1 || echo 0)"
echo "last_run=$last_curator"

echo "===GEPA==="
gepa_available=0
gepa_last=""
gepa_optimized=0
if [ -d ${HOME}/hermes-agent-self-evolution ] || command -v gepa >/dev/null 2>&1; then gepa_available=1; fi
if [ -f "$runtime/.gepa-last-run" ]; then gepa_last=$(cat "$runtime/.gepa-last-run"); fi
if [ -f "$runtime/.gepa-optimized-count" ]; then gepa_optimized=$(cat "$runtime/.gepa-optimized-count"); fi
echo "available=$gepa_available"
echo "last_run=$gepa_last"
echo "optimized=$gepa_optimized"

echo "===PROFILES==="
# Hermes profiles
if [ -d "$runtime/profiles" ]; then
  for pd in "$runtime/profiles"/*/; do
    [ ! -d "$pd" ] && continue
    pn=$(basename "$pd")
    pm=""; if [ -f "$pd/config.yaml" ]; then pm=$(grep -m1 'default:' "$pd/config.yaml" 2>/dev/null | awk '{print $2}'); fi
    ps=""; if [ -f "$pd/SOUL.md" ]; then ps=$(head -5 "$pd/SOUL.md" 2>/dev/null | tr '\\n' ' ' | head -c 120); fi
    pc=$(find "$pd/skills" -maxdepth 2 -name 'SKILL.md' 2>/dev/null | wc -l)
    pg=0; if [ -f "$pd/.env" ] && grep -q 'API_SERVER' "$pd/.env" 2>/dev/null; then pg=1; fi
    pt=0; if [ -f "$pd/.env" ] && grep -q 'TELEGRAM' "$pd/.env" 2>/dev/null; then pt=1; fi
    ph=0; if [ -f "$pd/HEARTBEAT.md" ]; then ph=1; fi
    echo "profile=hermes|name=$pn|model=$pm|soul=$ps|skills=$pc|gateway=$pg|telegram=$pt|heartbeat=$ph"
  done
fi
# OpenClaw agents
if [ -d ${HOME}/.openclaw/agents ]; then
  for ad in ${HOME}/.openclaw/agents/*/; do
    [ ! -d "$ad" ] && continue
    an=$(basename "$ad")
    as=""; if [ -f "$ad/SOUL.md" ]; then as=$(head -5 "$ad/SOUL.md" 2>/dev/null | tr '\\n' ' ' | head -c 120); fi
    ac=$(find "$ad/skills" -maxdepth 2 -name 'SKILL.md' 2>/dev/null | wc -l)
    ah=0; if [ -f "$ad/HEARTBEAT.md" ]; then ah=1; fi
    echo "profile=openclaw|name=$an|soul=$as|skills=$ac|heartbeat=$ah"
  done
fi
# Codex profiles
if [ -f ${HOME}/.codex/config.toml ]; then
  grep -oP '\\[profiles\\.\\K[^]]+' ${HOME}/.codex/config.toml 2>/dev/null | while read pn; do
    sm=$(grep -A5 "\\[profiles.$pn\\]" ${HOME}/.codex/config.toml 2>/dev/null | grep 'sandbox_mode' | head -1 | awk -F'"' '{print $2}')
    ap=$(grep -A5 "\\[profiles.$pn\\]" ${HOME}/.codex/config.toml 2>/dev/null | grep 'approval_policy' | head -1 | awk -F'"' '{print $2}')
    echo "profile=codex|name=$pn|sandbox=$sm|approval=$ap"
  done
fi
echo "profiles_done"

echo "===SESSIONS==="
sess_total=0; sess_transcripts=0
for d in "$runtime/sessions" ${HOME}/.openclaw/agents/*/sessions ${HOME}/.agent-machines/sessions; do
  if [ -d "$d" ]; then
    c=$(find "$d" -name '*.db' -o -name '*.jsonl' 2>/dev/null | wc -l)
    sess_total=$((sess_total + c))
  fi
done
if [ -f "$runtime/state.db" ]; then sess_transcripts=1; fi
echo "total=$sess_total"
echo "transcripts=$sess_transcripts"

echo "===HEARTBEAT==="
hb_enabled=0; hb_interval=""; hb_checklist=0
if [ "$agent" = "openclaw" ]; then
  hb_enabled=1
  hb_interval="30"
  if [ -f ${HOME}/.openclaw/workspace/HEARTBEAT.md ]; then hb_checklist=1; fi
fi
echo "enabled=$hb_enabled"
echo "interval=$hb_interval"
echo "checklist=$hb_checklist"

echo "===VECTOR==="
vec_available=0; vec_files=0; vec_provider=""
if [ -f ${HOME}/.openclaw/memory-index.db ] || [ -f ${HOME}/.openclaw/embeddings.db ]; then
  vec_available=1
  vec_files=$(find ${HOME}/.openclaw/workspace/memory -name '*.md' 2>/dev/null | wc -l)
fi
echo "available=$vec_available"
echo "files=$vec_files"
echo "provider=$vec_provider"

echo "===CHANNELS==="
if [ "$agent" = "openclaw" ]; then
  for ch in telegram whatsapp discord slack signal; do
    connected=0
    if pgrep -f "$ch" >/dev/null 2>&1 || [ -f ${HOME}/.openclaw/channels/$ch.json ]; then connected=1; fi
    echo "channel=$ch|connected=$connected"
  done
fi

echo "===SUBAGENTS==="
sa_available=0; sa_max=0; sa_active=0
if [ "$agent" = "openclaw" ]; then sa_available=1; sa_max=8; fi
if [ "$agent" = "claude-code" ]; then sa_available=1; sa_max=4; fi
echo "available=$sa_available"
echo "max=$sa_max"
echo "active=$sa_active"

echo "===SANDBOX==="
sandbox_mode=""
approval_policy=""
if [ "$agent" = "codex" ] && [ -f ${HOME}/.codex/config.toml ]; then
  sandbox_mode=$(grep -m1 'sandbox_mode' ${HOME}/.codex/config.toml 2>/dev/null | awk -F'"' '{print $2}')
  approval_policy=$(grep -m1 'approval_policy' ${HOME}/.codex/config.toml 2>/dev/null | awk -F'"' '{print $2}')
fi
if [ "$agent" = "openclaw" ]; then
  sandbox_mode=$(grep -m1 '"sandbox"' ${HOME}/.openclaw/config.json 2>/dev/null | awk -F'"' '{print $4}' || echo "off")
fi
echo "sandbox=$sandbox_mode"
echo "approval=$approval_policy"

echo "===END==="
`.trim();

export function parseIntrospection(stdout: string): MachineIntrospection {
	const sections = stdout.split(/===(\w+)===/);
	const sectionMap: Record<string, string> = {};
	for (let i = 1; i < sections.length - 1; i += 2) {
		sectionMap[sections[i]] = sections[i + 1].trim();
	}

	const detect = kv(sectionMap["DETECT"] ?? "");
	const detectedAgent = (detect["agent"] ?? "unknown") as AgentKind | "unknown";

	const memoryLimits: Record<string, number> = {
		"MEMORY.md": detectedAgent === "hermes" ? 2200 : 0,
		"USER.md": detectedAgent === "hermes" ? 1375 : 0,
	};

	return {
		detectedAgent,
		agentVersion: detect["version"] || null,
		model: detect["model"] || null,
		configPath: detect["config"] || null,
		identity: parseFileListing(sectionMap["IDENTITY"] ?? "", {}),
		memory: parseFileListing(sectionMap["MEMORY"] ?? "", memoryLimits),
		skills: parseSkills(sectionMap["SKILLS"] ?? ""),
		curator: parseCurator(sectionMap["CURATOR"] ?? ""),
		gepa: parseGepa(sectionMap["GEPA"] ?? ""),
		profiles: parseProfiles(sectionMap["PROFILES"] ?? ""),
		sessions: parseSessions(sectionMap["SESSIONS"] ?? ""),
		heartbeat: parseHeartbeat(sectionMap["HEARTBEAT"] ?? ""),
		vectorMemory: parseVector(sectionMap["VECTOR"] ?? ""),
		channels: parseChannels(sectionMap["CHANNELS"] ?? ""),
		subAgents: parseSubAgents(sectionMap["SUBAGENTS"] ?? ""),
		sandboxMode: kv(sectionMap["SANDBOX"] ?? "")["sandbox"] || null,
		approvalPolicy: kv(sectionMap["SANDBOX"] ?? "")["approval"] || null,
	};
}

function kv(block: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const line of block.split("\n")) {
		const eq = line.indexOf("=");
		if (eq > 0) result[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
	}
	return result;
}

function parseFileListing(block: string, limits: Record<string, number>): MemoryFile[] {
	const files: MemoryFile[] = [];
	for (const line of block.split("\n")) {
		if (!line.startsWith("file=")) continue;
		const parts: Record<string, string> = {};
		for (const seg of line.split("|")) {
			const eq = seg.indexOf("=");
			if (eq > 0) parts[seg.slice(0, eq)] = seg.slice(eq + 1);
		}
		const name = parts["file"] ?? "";
		const chars = Number.parseInt(parts["chars"] ?? "0", 10) || 0;
		const limit = limits[name] ?? null;
		files.push({
			name,
			path: parts["path"] ?? "",
			chars,
			limit,
			percent: limit ? Math.round((chars / limit) * 100) : null,
		});
	}
	return files;
}

function parseSkills(block: string): SkillSummary {
	const m = kv(block);
	const total = Number.parseInt(m["total"] ?? "0", 10) || 0;
	const agentAuthored = Number.parseInt(m["agent_authored"] ?? "0", 10) || 0;
	return {
		total,
		agentAuthored,
		bundled: total - agentAuthored,
		stale: Number.parseInt(m["stale"] ?? "0", 10) || 0,
		archived: Number.parseInt(m["archived"] ?? "0", 10) || 0,
		pinned: (m["pinned"] ?? "").split(",").filter(Boolean),
	};
}

function parseCurator(block: string): CuratorStatus {
	const m = kv(block);
	return {
		available: m["available"] === "1",
		lastRun: m["last_run"] || null,
	};
}

function parseGepa(block: string): GepaStatus {
	const m = kv(block);
	return {
		available: m["available"] === "1",
		lastRun: m["last_run"] || null,
		optimizedSkills: Number.parseInt(m["optimized"] ?? "0", 10) || 0,
	};
}

function parseProfiles(block: string): AgentProfile[] {
	const profiles: AgentProfile[] = [];
	for (const line of block.split("\n")) {
		if (!line.startsWith("profile=")) continue;
		const parts: Record<string, string> = {};
		for (const seg of line.split("|")) {
			const eq = seg.indexOf("=");
			if (eq > 0) parts[seg.slice(0, eq)] = seg.slice(eq + 1);
		}
		const agentKind = (parts["profile"] ?? "hermes") as AgentKind;
		profiles.push({
			name: parts["name"] ?? "unknown",
			agentKind,
			model: parts["model"] ?? "",
			soulPreview: parts["soul"] ?? "",
			skillCount: Number.parseInt(parts["skills"] ?? "0", 10) || 0,
			hasGateway: parts["gateway"] === "1",
			hasTelegram: parts["telegram"] === "1",
			hasHeartbeat: parts["heartbeat"] === "1",
			sandboxMode: parts["sandbox"] || null,
			approvalPolicy: parts["approval"] || null,
		});
	}
	return profiles;
}

function parseSessions(block: string): SessionStats {
	const m = kv(block);
	return {
		totalSessions: Number.parseInt(m["total"] ?? "0", 10) || 0,
		totalTranscripts: Number.parseInt(m["transcripts"] ?? "0", 10) || 0,
		oldestSession: null,
	};
}

function parseHeartbeat(block: string): HeartbeatStatus {
	const m = kv(block);
	return {
		enabled: m["enabled"] === "1",
		intervalMinutes: m["interval"] ? Number.parseInt(m["interval"], 10) : null,
		lastRun: null,
		hasChecklist: m["checklist"] === "1",
	};
}

function parseVector(block: string): VectorMemoryStatus {
	const m = kv(block);
	return {
		available: m["available"] === "1",
		indexedFiles: Number.parseInt(m["files"] ?? "0", 10) || 0,
		embeddingProvider: m["provider"] || null,
	};
}

function parseChannels(block: string): ChannelBridge[] {
	const channels: ChannelBridge[] = [];
	for (const line of block.split("\n")) {
		if (!line.startsWith("channel=")) continue;
		const parts: Record<string, string> = {};
		for (const seg of line.split("|")) {
			const eq = seg.indexOf("=");
			if (eq > 0) parts[seg.slice(0, eq)] = seg.slice(eq + 1);
		}
		channels.push({
			name: parts["channel"] ?? "",
			connected: parts["connected"] === "1",
		});
	}
	return channels;
}

function parseSubAgents(block: string): SubAgentStatus {
	const m = kv(block);
	return {
		available: m["available"] === "1",
		maxConcurrent: Number.parseInt(m["max"] ?? "0", 10) || 0,
		activeCount: Number.parseInt(m["active"] ?? "0", 10) || 0,
	};
}
