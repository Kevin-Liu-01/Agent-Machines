export type PublicIconName =
	| "activity"
	| "bar-chart"
	| "book"
	| "bot"
	| "boxes"
	| "braces"
	| "code"
	| "cpu"
	| "database"
	| "file"
	| "git-branch"
	| "hard-drive"
	| "key"
	| "layers"
	| "life-buoy"
	| "message"
	| "mouse"
	| "newspaper"
	| "route"
	| "search"
	| "server"
	| "shield"
	| "terminal"
	| "zap";

export type MarketingMetric = {
	label: string;
	value: string;
	detail: string;
};

export type MarketingStep = {
	label: string;
	body: string;
};

export type ProductFeature = {
	slug: string;
	href: string;
	title: string;
	navTitle: string;
	eyebrow: string;
	description: string;
	longDescription: string;
	icon: PublicIconName;
	badges: ReadonlyArray<string>;
	metrics: ReadonlyArray<MarketingMetric>;
	steps: ReadonlyArray<MarketingStep>;
	terminal: ReadonlyArray<string>;
};

export type AgentTemplate = {
	slug: string;
	href: string;
	title: string;
	navTitle: string;
	category: string;
	description: string;
	longDescription: string;
	icon: PublicIconName;
	runtime: string;
	modelPath: string;
	providerLane: string;
	loadout: ReadonlyArray<string>;
	metrics: ReadonlyArray<MarketingMetric>;
	workflow: ReadonlyArray<MarketingStep>;
};

export type ResourcePage = {
	slug: string;
	href: string;
	title: string;
	navTitle: string;
	eyebrow: string;
	description: string;
	icon: PublicIconName;
	sections: ReadonlyArray<MarketingStep>;
};

export const PRODUCT_FEATURES: ReadonlyArray<ProductFeature> = [
	{
		slug: "persistent-machines",
		href: "/product/persistent-machines",
		title: "Persistent machines",
		navTitle: "Persistent machines",
		eyebrow: "Persistence",
		description:
			"Dedicated worker records keep runtime state, files, logs, cron, and artifacts together.",
		longDescription:
			"Agent Machines treats the worker as the product object. The selected runtime, provider lane, model path, environment profile, and loadout are stored together, then replayed when the machine starts again.",
		icon: "server",
		badges: ["runtime root", "logs", "cron", "artifacts"],
		metrics: [
			{ label: "Runtime root", value: "~/.agent-machines", detail: "disk-backed state" },
			{ label: "Provider lanes", value: "4", detail: "E2B, Sprites, Dedalus, Vercel" },
			{ label: "Surfaces", value: "7", detail: "chat, terminal, logs, usage, cron, loadout, files" },
		],
		steps: [
			{ label: "Declare", body: "Pick runtime, provider, model path, spec, and loadout." },
			{ label: "Provision", body: "Create the provider machine and store a scoped machine record." },
			{ label: "Resume", body: "Read disk-backed runtime state instead of starting from an empty chat." },
		],
		terminal: [
			"$ am machine create deep-research",
			"runtime hermes",
			"provider vercel-sandbox",
			"root ~/.agent-machines",
			"status ready",
		],
	},
	{
		slug: "model-routing",
		href: "/product/model-routing",
		title: "Model paths",
		navTitle: "Model paths",
		eyebrow: "Models",
		description:
			"Send agents through Dedalus, OpenRouter, Vercel AI Gateway, native keys, or your own OpenAI-compatible endpoint.",
		longDescription:
			"Model choice is a machine setting, not a hardcoded agent assumption. Store model path profiles once, then switch the active upstream without rebuilding the worker or leaking credentials to the browser.",
		icon: "boxes",
		badges: ["BYOK", "OpenAI-compatible", "router profiles"],
		metrics: [
			{ label: "Profile types", value: "5", detail: "router, native, gateway, custom, local" },
			{ label: "Credential path", value: "server", detail: "private metadata" },
			{ label: "Runtime support", value: "4", detail: "Hermes, OpenClaw, Claude, Codex" },
		],
		steps: [
			{ label: "Store", body: "Add model credentials to the account credential gate." },
			{ label: "Select", body: "Attach a model path profile to each machine or runtime preset." },
			{ label: "Inspect", body: "Usage panels show which model path carried the work." },
		],
		terminal: [
			"gateway profile: research",
			"base_url: /v1-compatible",
			"model: claude-4-sonnet",
			"fallback: configured",
			"secrets: redacted",
		],
	},
	{
		slug: "isolation",
		href: "/product/isolation",
		title: "Isolated by default",
		navTitle: "Isolation",
		eyebrow: "Security",
		description:
			"Run untrusted agent work in provider-backed workers with scoped credentials and explicit controls.",
		longDescription:
			"The dashboard never needs raw provider secrets on the client. Machines receive only the environment they need, and the UI exposes lifecycle controls through the provider abstraction.",
		icon: "shield",
		badges: ["scoped env", "private keys", "provider boundary"],
		metrics: [
			{ label: "Secret exposure", value: "0", detail: "raw keys in browser" },
			{ label: "Machine records", value: "scoped", detail: "per account" },
			{ label: "Controls", value: "explicit", detail: "wake, pause, delete" },
		],
		steps: [
			{ label: "Gate", body: "Validate credentials before provisioning begins." },
			{ label: "Scope", body: "Attach only the selected provider and model environment." },
			{ label: "Audit", body: "Track lifecycle, logs, and usage from the dashboard." },
		],
		terminal: [
			"credential gate passed",
			"provider env scoped",
			"client secrets redacted",
			"lifecycle controls enabled",
		],
	},
	{
		slug: "lifecycle",
		href: "/product/lifecycle",
		title: "Lifecycle controls",
		navTitle: "Lifecycle controls",
		eyebrow: "Operations",
		description:
			"Provision, wake, pause, stream, inspect, and delete workers through one provider-facing shape.",
		longDescription:
			"Each provider supports a different set of lifecycle operations. Agent Machines normalizes the dashboard shape while still showing the exact controls available for the selected lane.",
		icon: "zap",
		badges: ["provision", "wake", "stream", "delete"],
		metrics: [
			{ label: "Provider lanes", value: "4", detail: "one UI contract" },
			{ label: "State polling", value: "live", detail: "dashboard refresh" },
			{ label: "Fallbacks", value: "visible", detail: "only supported controls render" },
		],
		steps: [
			{ label: "Create", body: "Provision the worker with a selected spec and runtime." },
			{ label: "Drive", body: "Use lane-specific wake, pause, stream, and command controls." },
			{ label: "Recover", body: "Open logs and artifacts when a step fails." },
		],
		terminal: [
			"machine.lifecycle",
			"provision -> ready",
			"command -> streamed",
			"usage -> recorded",
			"pause -> provider-supported",
		],
	},
	{
		slug: "snapshots-volumes",
		href: "/product/snapshots-volumes",
		title: "Snapshots and volumes",
		navTitle: "Snapshots and volumes",
		eyebrow: "State",
		description:
			"Keep disk-backed runtime state and surface snapshots or forks when the selected provider supports them.",
		longDescription:
			"Persistent state is the baseline. Snapshot, fork, and public URL behavior depends on the provider lane, so the UI calls out support instead of pretending every substrate behaves the same.",
		icon: "git-branch",
		badges: ["disk-backed", "provider-specific", "artifacts"],
		metrics: [
			{ label: "Baseline", value: "volume", detail: "runtime state persists" },
			{ label: "Forking", value: "lane-based", detail: "shown when supported" },
			{ label: "Artifacts", value: "tracked", detail: "files, outputs, reports" },
		],
		steps: [
			{ label: "Persist", body: "Store runtime and app output in the worker root." },
			{ label: "Surface", body: "Show snapshot and fork affordances only when available." },
			{ label: "Inspect", body: "Expose artifacts beside logs and usage." },
		],
		terminal: [
			"state volume mounted",
			"snapshot support detected",
			"artifact index updated",
			"resume source disk",
		],
	},
	{
		slug: "api",
		href: "/product/api",
		title: "Machine API",
		navTitle: "Machine API",
		eyebrow: "Control",
		description:
			"Create, run, and inspect agent machines through dashboard APIs and typed machine records.",
		longDescription:
			"The dashboard is the human control plane. Under it, machine records, gateway profiles, logs, metrics, and lifecycle lanes are shaped so the same model can support an SDK and agent-to-agent orchestration.",
		icon: "terminal",
		badges: ["typed records", "logs", "metrics", "gateway"],
		metrics: [
			{ label: "Primary object", value: "machine", detail: "runtime plus provider plus loadout" },
			{ label: "Observability", value: "built in", detail: "logs and usage APIs" },
			{ label: "Gateway", value: "switchable", detail: "chat and task entrypoints" },
		],
		steps: [
			{ label: "Record", body: "Store machine identity, provider lane, runtime, and profile." },
			{ label: "Launch", body: "Send chat or task traffic through the selected runtime." },
			{ label: "Observe", body: "Read logs, usage, state, artifacts, and cron status." },
		],
		terminal: [
			"GET /api/dashboard/machines",
			"GET /api/dashboard/logs",
			"GET /api/dashboard/metrics/usage",
			"POST /api/dashboard/gateway",
		],
	},
];

export const AGENT_TEMPLATES: ReadonlyArray<AgentTemplate> = [
	{
		slug: "code-reviewer",
		href: "/agents/code-reviewer",
		title: "Code Reviewer",
		navTitle: "Review Worker",
		category: "Engineering",
		description: "Checks diffs and returns prioritized findings.",
		longDescription:
			"A task-driven coding worker for pull request review. Pair it with Codex or Claude Code, attach repo access, and keep findings, logs, and artifacts in the machine view.",
		icon: "git-branch",
		runtime: "Codex CLI or Claude Code",
		modelPath: "OpenAI, Anthropic, or router profile",
		providerLane: "Vercel Sandbox, E2B, or Dedalus",
		loadout: ["repo search", "tests", "lint", "security notes"],
		metrics: [
			{ label: "Best for", value: "diffs", detail: "review and regression checks" },
			{ label: "Mode", value: "task", detail: "runs per review" },
			{ label: "Output", value: "findings", detail: "severity and file references" },
		],
		workflow: [
			{ label: "Clone", body: "Attach the repository and branch to the worker." },
			{ label: "Check", body: "Run tests, typecheck, lint, and targeted searches." },
			{ label: "Report", body: "Return prioritized findings with exact file context." },
		],
	},
	{
		slug: "coding-agent",
		href: "/agents/coding-agent",
		title: "Coding Agent",
		navTitle: "Coding Worker",
		category: "Engineering",
		description: "Implements scoped changes with terminal state.",
		longDescription:
			"A coding worker for concrete implementation tasks. It launches with a repo, runtime CLI, shell, tests, and provider-backed workspace state.",
		icon: "code",
		runtime: "Codex CLI or Claude Code",
		modelPath: "OpenAI, Anthropic, or router profile",
		providerLane: "Vercel Sandbox, E2B, or Dedalus",
		loadout: ["terminal", "patch", "test runner", "artifact capture"],
		metrics: [
			{ label: "Best for", value: "features", detail: "scoped implementation" },
			{ label: "Mode", value: "task", detail: "explicit run instructions" },
			{ label: "State", value: "files", detail: "workspace output persists" },
		],
		workflow: [
			{ label: "Plan", body: "Read the repo and define the smallest valid change." },
			{ label: "Edit", body: "Patch files, run checks, and capture output." },
			{ label: "Hand off", body: "Summarize files changed and verification." },
		],
	},
	{
		slug: "deep-research",
		href: "/agents/deep-research",
		title: "Deep Research",
		navTitle: "Research Worker",
		category: "Research",
		description: "Builds cited briefs from saved sources.",
		longDescription:
			"A persistent research worker for multi-source synthesis. It keeps search notes, extracted pages, citations, and report drafts on the worker so follow-up questions start with context.",
		icon: "search",
		runtime: "Hermes",
		modelPath: "Router profile or OpenAI-compatible endpoint",
		providerLane: "Vercel Sandbox, E2B, Sprites, or Dedalus",
		loadout: ["web search", "page extract", "citations", "report artifacts"],
		metrics: [
			{ label: "Best for", value: "briefs", detail: "cited research reports" },
			{ label: "Mode", value: "stateful", detail: "follow-ups use saved context" },
			{ label: "Output", value: "artifact", detail: "source map plus synthesis" },
		],
		workflow: [
			{ label: "Scope", body: "Define the question, exclusions, and freshness needs." },
			{ label: "Collect", body: "Search, extract, and save source notes with provenance." },
			{ label: "Synthesize", body: "Produce a report with claims tied back to sources." },
		],
	},
	{
		slug: "data-analyst",
		href: "/agents/data-analyst",
		title: "Data Analyst",
		navTitle: "Data Worker",
		category: "Data",
		description: "Queries connected data and saves analysis.",
		longDescription:
			"A data worker for warehouse questions, CSV inspection, charts, and repeatable analysis. It is designed around explicit data connectors and saved notebooks or reports.",
		icon: "bar-chart",
		runtime: "Hermes or Claude Code",
		modelPath: "Router profile or native provider key",
		providerLane: "E2B, Vercel Sandbox, or Dedalus",
		loadout: ["SQL MCP", "CSV tools", "charts", "artifact capture"],
		metrics: [
			{ label: "Best for", value: "analysis", detail: "questions over data" },
			{ label: "Mode", value: "guided", detail: "connector-scoped" },
			{ label: "Output", value: "tables", detail: "charts and files" },
		],
		workflow: [
			{ label: "Connect", body: "Attach a warehouse, file, or MCP with scoped access." },
			{ label: "Query", body: "Run explainable queries and checks." },
			{ label: "Package", body: "Save charts, tables, and notes as artifacts." },
		],
	},
	{
		slug: "computer-use",
		href: "/agents/computer-use",
		title: "Computer Use",
		navTitle: "Browser Worker",
		category: "Browser",
		description: "Runs browser and desktop actions safely.",
		longDescription:
			"A browser automation worker for visual tasks, web workflows, screenshots, and computer-use style interaction. It is best backed by OpenClaw and explicit allowlists.",
		icon: "mouse",
		runtime: "OpenClaw",
		modelPath: "Anthropic, OpenAI, or router profile",
		providerLane: "Vercel Sandbox, E2B, or Dedalus",
		loadout: ["browser", "screenshots", "vision", "terminal"],
		metrics: [
			{ label: "Best for", value: "browser", detail: "visual workflows" },
			{ label: "Mode", value: "automate", detail: "observe, click, verify" },
			{ label: "Output", value: "screens", detail: "snapshots and logs" },
		],
		workflow: [
			{ label: "Open", body: "Launch a browser session inside the machine." },
			{ label: "Act", body: "Navigate, click, type, and inspect screenshots." },
			{ label: "Verify", body: "Save browser state, logs, and captured artifacts." },
		],
	},
	{
		slug: "support-agent",
		href: "/agents/support-agent",
		title: "Support Agent",
		navTitle: "Support Worker",
		category: "Operations",
		description: "Triages tickets and drafts handoffs.",
		longDescription:
			"A support operations worker that combines helpdesk context, knowledge search, and browser tools. It is built to escalate clearly instead of pretending every ticket is solvable.",
		icon: "life-buoy",
		runtime: "Hermes or OpenClaw",
		modelPath: "Router profile or native provider key",
		providerLane: "Sprites, E2B, Vercel Sandbox, or Dedalus",
		loadout: ["helpdesk MCP", "knowledge base", "browser", "handoff notes"],
		metrics: [
			{ label: "Best for", value: "tickets", detail: "triage and response drafts" },
			{ label: "Mode", value: "queued", detail: "cron or event driven" },
			{ label: "Output", value: "drafts", detail: "reply and escalation notes" },
		],
		workflow: [
			{ label: "Read", body: "Pull ticket context and relevant knowledge." },
			{ label: "Resolve", body: "Draft replies or run approved browser steps." },
			{ label: "Escalate", body: "Hand off uncertain cases with full context." },
		],
	},
	{
		slug: "runbook-operator",
		href: "/agents/runbook-operator",
		title: "Runbook Operator",
		navTitle: "Runbook Operator",
		category: "Infrastructure",
		description: "Runs operational playbooks with logs, approvals, and rollback notes.",
		longDescription:
			"A production operations worker for repeatable runbooks. It keeps command logs and artifacts visible so every action has an audit trail.",
		icon: "terminal",
		runtime: "Hermes or Codex CLI",
		modelPath: "Router profile or native provider key",
		providerLane: "Dedalus, E2B, or Vercel Sandbox",
		loadout: ["terminal", "cloud CLIs", "logs", "approvals"],
		metrics: [
			{ label: "Best for", value: "runbooks", detail: "repeatable ops tasks" },
			{ label: "Mode", value: "approved", detail: "human-gated actions" },
			{ label: "Output", value: "audit", detail: "command and result trail" },
		],
		workflow: [
			{ label: "Load", body: "Attach the runbook, env profile, and cloud tooling." },
			{ label: "Run", body: "Move through steps with checkpoints and logs." },
			{ label: "Close", body: "Save outputs, risks, and rollback notes." },
		],
	},
	{
		slug: "qa-browser",
		href: "/agents/qa-browser",
		title: "QA Browser",
		navTitle: "QA Browser",
		category: "Quality",
		description: "Walks product flows, captures screenshots, and reports broken states.",
		longDescription:
			"A browser QA worker for signup, onboarding, dashboard, and regression flows. It is designed to capture proof instead of just saying a flow passed.",
		icon: "activity",
		runtime: "OpenClaw or Hermes",
		modelPath: "Router profile or native provider key",
		providerLane: "Vercel Sandbox, E2B, or Dedalus",
		loadout: ["browser", "screenshots", "console logs", "accessibility checks"],
		metrics: [
			{ label: "Best for", value: "flows", detail: "end-to-end product checks" },
			{ label: "Mode", value: "scheduled", detail: "manual or cron" },
			{ label: "Output", value: "proof", detail: "screenshots and console logs" },
		],
		workflow: [
			{ label: "Navigate", body: "Open the app and follow the target path." },
			{ label: "Observe", body: "Capture UI state, console warnings, and artifacts." },
			{ label: "Report", body: "Return failures with repro steps and evidence." },
		],
	},
	{
		slug: "knowledge-curator",
		href: "/agents/knowledge-curator",
		title: "Knowledge Curator",
		navTitle: "Knowledge Curator",
		category: "Knowledge",
		description: "Turns docs, notes, and transcripts into reusable machine context.",
		longDescription:
			"A knowledge worker for maintaining memory, docs, and searchable context. It pairs well with Hermes because sessions and memory live with the runtime.",
		icon: "book",
		runtime: "Hermes",
		modelPath: "Router profile or OpenAI-compatible endpoint",
		providerLane: "Sprites, E2B, Vercel Sandbox, or Dedalus",
		loadout: ["memory", "search", "docs", "artifact index"],
		metrics: [
			{ label: "Best for", value: "memory", detail: "reusable context" },
			{ label: "Mode", value: "stateful", detail: "sessions and notes persist" },
			{ label: "Output", value: "docs", detail: "curated files and indexes" },
		],
		workflow: [
			{ label: "Collect", body: "Read notes, docs, transcripts, and artifacts." },
			{ label: "Normalize", body: "Turn raw context into durable files." },
			{ label: "Index", body: "Update memory and search surfaces." },
		],
	},
	{
		slug: "security-auditor",
		href: "/agents/security-auditor",
		title: "Security Auditor",
		navTitle: "Security Auditor",
		category: "Security",
		description: "Reviews config, dependencies, and exposed surfaces with a threat-model lens.",
		longDescription:
			"A security review worker for focused audits. It can inspect repo configuration, dependency surfaces, environment exposure, and runtime assumptions.",
		icon: "shield",
		runtime: "Codex CLI or Claude Code",
		modelPath: "OpenAI, Anthropic, or router profile",
		providerLane: "E2B, Vercel Sandbox, or Dedalus",
		loadout: ["dependency audit", "secret checks", "config review", "threat model"],
		metrics: [
			{ label: "Best for", value: "audit", detail: "focused risk review" },
			{ label: "Mode", value: "task", detail: "explicit scope" },
			{ label: "Output", value: "risks", detail: "severity and remediation" },
		],
		workflow: [
			{ label: "Scope", body: "Define assets, trust boundaries, and files to inspect." },
			{ label: "Review", body: "Search for risky config, dependencies, and flows." },
			{ label: "Prioritize", body: "Return issues by exploitability and blast radius." },
		],
	},
	{
		slug: "finance-analyst",
		href: "/agents/finance-analyst",
		title: "Finance Analyst",
		navTitle: "Finance Analyst",
		category: "Finance",
		description: "Builds reports from connected spreadsheets, ledgers, and exported data.",
		longDescription:
			"A finance analysis worker for structured files and connected systems. It should run with explicit source access and save generated tables as artifacts.",
		icon: "database",
		runtime: "Hermes or Claude Code",
		modelPath: "Router profile or native provider key",
		providerLane: "E2B, Vercel Sandbox, or Dedalus",
		loadout: ["spreadsheets", "CSV", "charts", "report artifacts"],
		metrics: [
			{ label: "Best for", value: "reports", detail: "structured financial analysis" },
			{ label: "Mode", value: "guided", detail: "source-scoped" },
			{ label: "Output", value: "tables", detail: "summaries and files" },
		],
		workflow: [
			{ label: "Load", body: "Attach exports, sheets, or approved connectors." },
			{ label: "Analyze", body: "Check assumptions and produce reconciled tables." },
			{ label: "Export", body: "Save the report and supporting calculations." },
		],
	},
	{
		slug: "growth-researcher",
		href: "/agents/growth-researcher",
		title: "Growth Researcher",
		navTitle: "Growth Researcher",
		category: "Growth",
		description: "Researches markets, competitors, content angles, and source-backed briefs.",
		longDescription:
			"A growth research worker for market maps, competitive scans, content briefs, and customer signal synthesis. It keeps sources and drafts inspectable.",
		icon: "route",
		runtime: "Hermes",
		modelPath: "Router profile or OpenAI-compatible endpoint",
		providerLane: "Sprites, E2B, Vercel Sandbox, or Dedalus",
		loadout: ["web search", "source extraction", "notes", "brief artifacts"],
		metrics: [
			{ label: "Best for", value: "markets", detail: "source-backed strategy" },
			{ label: "Mode", value: "stateful", detail: "saved research trail" },
			{ label: "Output", value: "briefs", detail: "angles and evidence" },
		],
		workflow: [
			{ label: "Map", body: "Define segments, competitors, and target questions." },
			{ label: "Collect", body: "Gather public sources and summarize signals." },
			{ label: "Brief", body: "Package insights, claims, and next actions." },
		],
	},
];

const NAV_AGENT_SLUGS = [
	"code-reviewer",
	"coding-agent",
	"deep-research",
	"data-analyst",
	"computer-use",
	"support-agent",
] as const;

export const NAV_AGENT_TEMPLATES: ReadonlyArray<AgentTemplate> =
	NAV_AGENT_SLUGS.flatMap((slug) => {
		const template = AGENT_TEMPLATES.find((agent) => agent.slug === slug);
		return template ? [template] : [];
	});

export const RESOURCE_PAGES: ReadonlyArray<ResourcePage> = [
	{
		slug: "docs",
		href: "/docs",
		title: "Documentation",
		navTitle: "Documentation",
		eyebrow: "Docs",
		description:
			"Guides for machine setup, provider credentials, runtime choices, loadouts, and dashboard operations.",
		icon: "book",
		sections: [
			{ label: "Start", body: "Create an account, add provider credentials, and provision a first machine." },
			{ label: "Configure", body: "Choose runtime, provider lane, model path, machine spec, and loadout." },
			{ label: "Operate", body: "Use chat, terminal, logs, usage, cron, artifacts, and lifecycle controls." },
		],
	},
	{
		slug: "api-reference",
		href: "/api-reference",
		title: "API reference",
		navTitle: "API reference",
		eyebrow: "API",
		description:
			"Reference notes for dashboard APIs, gateway calls, machine records, logs, metrics, and future SDK shapes.",
		icon: "braces",
		sections: [
			{ label: "Machines", body: "List, inspect, provision, and update machine records." },
			{ label: "Gateway", body: "Send chat or task traffic through the selected runtime lane." },
			{ label: "Telemetry", body: "Read logs, daily usage rollups, artifacts, and cron state." },
		],
	},
	{
		slug: "blog",
		href: "/blog",
		title: "Blog",
		navTitle: "Blog",
		eyebrow: "Blog",
		description:
			"Engineering notes about persistent agents, provider lanes, runtime loadouts, and fleet operations.",
		icon: "newspaper",
		sections: [
			{ label: "Architecture", body: "How the control plane sits above sandboxes and agent runtimes." },
			{ label: "Operations", body: "What logs, usage tracking, cron, and artifacts reveal about workers." },
			{ label: "Patterns", body: "Practical templates for research, coding, browser, data, and support agents." },
		],
	},
	{
		slug: "contact",
		href: "/contact",
		title: "Contact",
		navTitle: "Contact",
		eyebrow: "Contact",
		description:
			"Talk through provider setup, security boundaries, agent templates, and production rollout needs.",
		icon: "message",
		sections: [
			{ label: "Scale", body: "Map provider lanes, machine specs, and runtime choices to your workload." },
			{ label: "Security", body: "Review credential handling, machine isolation, and audit requirements." },
			{ label: "Onboarding", body: "Design the first useful worker and the loadout it needs." },
		],
	},
];

export function productFeatureBySlug(slug: string): ProductFeature | undefined {
	return PRODUCT_FEATURES.find((feature) => feature.slug === slug);
}

export function agentTemplateBySlug(slug: string): AgentTemplate | undefined {
	return AGENT_TEMPLATES.find((agent) => agent.slug === slug);
}

export function resourcePageBySlug(slug: string): ResourcePage | undefined {
	return RESOURCE_PAGES.find((page) => page.slug === slug);
}
