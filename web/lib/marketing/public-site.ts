export type PublicIconName =
	| "activity"
	| "bar-chart"
	| "book"
	| "bot"
	| "boxes"
	| "braces"
	| "code"
	| "clock"
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
			"Keep an agent's saved setup and workspace together while choosing where it runs.",
		longDescription:
			"Save the runtime, model, memory selection, environment, and schedules as a Worker configuration. The control plane tracks its machine and lifecycle operations. Files and runtime state persist according to the selected provider; keeping a record is not an uptime or backup guarantee.",
		icon: "server",
		badges: ["runtime root", "logs", "cron", "artifacts"],
		metrics: [
			{ label: "Runtime root", value: "~/.agent-machines", detail: "disk-backed state" },
			{ label: "Provider lanes", value: "4", detail: "E2B, Sprites, Daytona, Vercel" },
			{ label: "Surfaces", value: "7", detail: "chat, terminal, logs, usage, cron, loadout, files" },
		],
		steps: [
			{ label: "Configure", body: "Choose a runtime and model, then edit its memory and abilities." },
			{ label: "Run", body: "Choose a credentialed provider and inspect the launch operation." },
			{ label: "Continue", body: "Return to saved files and supported native history; check the provider's persistence limits." },
		],
		terminal: [
			"saved configuration → runtime + model",
			"memory → persona + instructions + context",
			"compute → selected provider",
			"workspace → files + native history",
			"lifecycle → observed operation status",
		],
	},
	{
		slug: "model-routing",
		href: "/product/model-routing",
		title: "Model paths",
		navTitle: "Model paths",
		eyebrow: "Models",
		description:
			"Choose a model and supported upstream separately from the machine that runs the agent.",
		longDescription:
			"Hosted Claude Code uses native Anthropic credentials; hosted Codex uses native OpenAI. Hermes and OpenClaw can use configured router profiles or compatible custom endpoints. The direct SDK has its own upstream support table. A model name still has to work with the selected runtime and endpoint.",
		icon: "boxes",
		badges: ["BYOK", "OpenAI-compatible", "router profiles"],
		metrics: [
			{ label: "Model choice", value: "explicit", detail: "selected per configuration" },
			{ label: "Credentials", value: "BYOK", detail: "your account's upstream keys" },
			{ label: "Compatibility", value: "runtime-specific", detail: "hosted and direct SDK paths differ" },
		],
		steps: [
			{ label: "Connect", body: "Add your model-provider credentials in Settings." },
			{ label: "Select", body: "Choose a supported model and endpoint for the runtime." },
			{ label: "Verify", body: "Inspect the configuration operation and run a scoped task to check access." },
		],
		terminal: [
			"hosted Claude Code → native Anthropic",
			"hosted Codex → native OpenAI",
			"hosted Hermes / OpenClaw → supported profile",
			"model → valid ID for that endpoint",
			"compute choice → configured separately",
		],
	},
	{
		slug: "isolation",
		href: "/product/isolation",
		title: "Runtime and account boundaries",
		navTitle: "Isolation",
		eyebrow: "Security",
		description:
			"Run agent commands on provider-backed machines and manage access through your account.",
		longDescription:
			"Agent commands execute inside the selected provider's environment. Account checks control access to saved configurations and machine operations, and saved keys are redacted in normal configuration responses. Provider isolation, runtime permissions, and the credentials you supply define the security boundary; a template is not a safety policy.",
		icon: "shield",
		badges: ["scoped env", "private keys", "provider boundary"],
		metrics: [
			{ label: "Saved keys", value: "redacted", detail: "normal configuration responses" },
			{ label: "Machine records", value: "scoped", detail: "per account" },
			{ label: "Isolation", value: "provider", detail: "inspect the selected environment" },
		],
		steps: [
			{ label: "Connect", body: "Supply keys for the provider and model you intend to use." },
			{ label: "Limit", body: "Review runtime permissions and use narrowly scoped service credentials." },
			{ label: "Inspect", body: "Read operations, command output, and available native history." },
		],
		terminal: [
			"account → access to saved configurations",
			"provider → remote execution boundary",
			"runtime → native permissions and tools",
			"service keys → permissions you grant",
		],
	},
	{
		slug: "lifecycle",
		href: "/product/lifecycle",
		title: "Lifecycle controls",
		navTitle: "Lifecycle controls",
		eyebrow: "Operations",
		description:
			"Launch, inspect, repair, move, and stop agents where the selected provider supports it.",
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
			{ label: "Apply", body: "Persist desired runtime, sandbox, spec, and lifecycle state." },
			{ label: "Drive", body: "Use lane-specific wake, pause, stream, and command controls." },
			{ label: "Recover", body: "Reclaim expired operations and retry idempotent lifecycle work." },
		],
		terminal: [
			"request → journaled operation",
			"launch → install and readiness checks",
			"run → streamed command output",
			"sleep → supported providers only",
			"move → declared files; processes restart",
		],
	},
	{
		slug: "snapshots-volumes",
		href: "/product/snapshots-volumes",
		title: "Persistent state and checkpoints",
		navTitle: "Persistent state",
		eyebrow: "State",
		description:
			"Keep disk-backed runtime state across sleep and wake, using the checkpoint behavior of the selected provider.",
		longDescription:
			"Persistence is provider-specific: E2B can preserve memory and files through pause, Vercel uses filesystem snapshots, Sprites retain disk state, and Daytona stop/start preserves files rather than running processes. The dashboard exposes only the controls supported by each adapter.",
		icon: "git-branch",
		badges: ["disk-backed", "provider-specific", "artifacts"],
		metrics: [
			{ label: "State", value: "files", detail: "provider retention rules apply" },
			{ label: "Checkpointing", value: "provider-specific", detail: "not a universal snapshot API" },
			{ label: "Artifacts", value: "tracked", detail: "files, outputs, reports" },
		],
		steps: [
			{ label: "Persist", body: "Store runtime and app output in the worker root." },
			{ label: "Checkpoint", body: "Use the provider's automatic pause, resume, or snapshot behavior." },
			{ label: "Inspect", body: "Expose artifacts beside logs and usage." },
		],
		terminal: [
			"E2B → pause preserves memory and files",
			"Daytona → stop/start preserves files",
			"Vercel → filesystem snapshots",
			"Sprites → persistent disk, automatic idle",
		],
	},
	{
		slug: "api",
		href: "/product/api",
		title: "SDK and control-plane API",
		navTitle: "SDK and API",
		eyebrow: "Control",
		description:
			"Use a typed SDK for direct provider access or the hosted API for managed agent runs.",
		longDescription:
			"The MIT-licensed package exports createMux for direct runtime/provider orchestration, AgentMachines for hosted create-and-run calls, and a declarative control plane with replaceable storage and runtime-driver interfaces. These are separate entry points with different configuration support, not one interchangeable client.",
		icon: "terminal",
		badges: ["TypeScript", "MIT", "streaming", "control plane"],
		metrics: [
			{ label: "Direct SDK", value: "createMux", detail: "runtime and provider adapters" },
			{ label: "Hosted client", value: "AgentMachines", detail: "create and run over HTTP" },
			{ label: "Control plane", value: "WorkerSpec", detail: "desired state and operations" },
		],
		steps: [
			{ label: "Choose", body: "Use the hosted client or connect directly to your provider through createMux." },
			{ label: "Configure", body: "Provide credentials and choose a supported runtime, model, and provider." },
			{ label: "Run", body: "Stream direct SDK events or await a hosted run's result." },
		],
		terminal: [
			"direct → createMux().create(...)",
			"stream → machine.run(prompt)",
			"hosted → new AgentMachines(...)",
			"state → AgentMachinesControlPlane",
		],
	},
];

export const AGENT_TEMPLATES: ReadonlyArray<AgentTemplate> = [
	{
		slug: "code-reviewer",
		href: "/agents/code-reviewer",
		title: "Code Reviewer",
		navTitle: "Code Reviewer",
		category: "Engineering",
		description: "A review-focused starting prompt and skill selection for checking diffs.",
		longDescription:
			"Start with Codex, a code-review role prompt, and selected review skills. Add repository access, choose your model and compute, then ask for prioritized findings. The template configures a starting point; it does not connect a repository or run a review for you.",
		icon: "git-branch",
		runtime: "Codex CLI",
		modelPath: "Native OpenAI; choose a supported model",
		providerLane: "Choose Daytona, E2B, Sprites, or Vercel",
		loadout: ["code-review", "gstack-review", "deepsec", "rtfm", "cursor-bridge", "playwright"],
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
		navTitle: "Coding Agent",
		category: "Engineering",
		description: "A coding role prompt with skills for repo inspection, changes, and verification.",
		longDescription:
			"Start with Codex and an implementation-focused prompt. The preset selects coding and verification skills; you supply the repository, service access, model, and compute. Edit the instructions before running a scoped task in the Console or native terminal.",
		icon: "code",
		runtime: "Codex CLI",
		modelPath: "Native OpenAI; choose a supported model",
		providerLane: "Choose Daytona, E2B, Sprites, or Vercel",
		loadout: ["closed-loop-development", "cursor-coding", "rtfm", "commit", "cursor-bridge", "playwright"],
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
		navTitle: "Deep Research",
		category: "Research",
		description: "A research prompt and source-gathering skills for cited briefs.",
		longDescription:
			"Start with Hermes, a source-first research prompt, and selected research skills. Configure the search services you want to use, set the question, and ask the agent to save source notes and a cited brief. Search credentials and working connectors are separate setup steps.",
		icon: "search",
		runtime: "Hermes",
		modelPath: "Router profile or OpenAI-compatible endpoint",
		providerLane: "Choose Daytona, E2B, Sprites, or Vercel",
		loadout: ["agent-reach", "last30days", "read-and-review", "exa", "brave-search", "playwright"],
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
		navTitle: "Data Analyst",
		category: "Data",
		description: "A data-analysis prompt with database skills and connector selections.",
		longDescription:
			"Start with Hermes and instructions to validate queries and assumptions. The preset selects database skills, Supabase, and memory entries. Supply your data and configure scoped connectors before asking for analysis; selecting a connector does not grant database access.",
		icon: "bar-chart",
		runtime: "Hermes",
		modelPath: "Supported router or native-provider profile",
		providerLane: "Choose Daytona, E2B, Sprites, or Vercel",
		loadout: ["db", "db-write", "rtfm", "closed-loop-development", "supabase", "memory"],
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
		navTitle: "Computer Use",
		category: "Browser",
		description: "An OpenClaw starting setup for browser-oriented tasks and visual checks.",
		longDescription:
			"Start with OpenClaw and observe-act-verify instructions. Configure browser tooling, accounts, and permissions for your task, and choose enough compute for the runtime. This is a starter configuration, not a preconfigured desktop or a safety guarantee.",
		icon: "mouse",
		runtime: "OpenClaw",
		modelPath: "Anthropic, OpenAI, or router profile",
		providerLane: "Choose Daytona, E2B, Sprites, or Vercel",
		loadout: ["computer-use", "agent-browser", "playwright", "closed-loop-development", "cursor-bridge"],
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
		navTitle: "Support Agent",
		category: "Operations",
		description: "A support prompt for triage, response drafts, and explicit handoffs.",
		longDescription:
			"Start with Hermes and a prompt to read context, draft concise replies, and escalate uncertainty. The preset selects Linear, Slack, and Notion entries. Configure those services and your approval process before giving it customer work; no inbox or event subscription is created by the preset.",
		icon: "life-buoy",
		runtime: "Hermes",
		modelPath: "Supported router or native-provider profile",
		providerLane: "Choose Daytona, E2B, Sprites, or Vercel",
		loadout: ["linear", "slack", "read-and-review", "rtfm", "notion"],
		metrics: [
			{ label: "Best for", value: "tickets", detail: "triage and response drafts" },
			{ label: "Mode", value: "task", detail: "scheduling is a separate choice" },
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
		description: "A runbook-focused prompt and operations skill selection.",
		longDescription:
			"Start with Hermes and instructions to follow a runbook, record checks, and flag unsafe ambiguity. Configure cloud access and permissions yourself. Approval language in a prompt is guidance, not an enforced approval gate; review the actual runtime and service permissions before production work.",
		icon: "terminal",
		runtime: "Hermes",
		modelPath: "Supported router or native-provider profile",
		providerLane: "Choose Daytona, E2B, Sprites, or Vercel",
		loadout: ["production-safety", "gh-fix-ci", "ci-cd-best-practices", "vercel", "datadog", "sentry"],
		metrics: [
			{ label: "Best for", value: "runbooks", detail: "repeatable ops tasks" },
			{ label: "Mode", value: "scoped", detail: "permissions require your setup" },
			{ label: "Output", value: "notes", detail: "checks and rollback instructions" },
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
		description: "A browser-QA prompt with skills for flow checks and reproducible findings.",
		longDescription:
			"Start with OpenClaw and a prompt to exercise real flows and retain evidence. Configure browser tooling and a test account, then supply the URL and scope. The setup selects QA skills; it does not automatically test your app or create a schedule.",
		icon: "activity",
		runtime: "OpenClaw",
		modelPath: "Supported router or native-provider profile",
		providerLane: "Choose Daytona, E2B, Sprites, or Vercel",
		loadout: ["gstack-qa", "qa", "dogfood", "agent-browser", "playwright", "cursor-bridge"],
		metrics: [
			{ label: "Best for", value: "flows", detail: "end-to-end product checks" },
			{ label: "Mode", value: "task", detail: "add a schedule separately" },
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
		description: "A curation prompt and documentation skills for reusable context.",
		longDescription:
			"Start with Hermes and instructions to preserve sources and maintain durable notes. Provide the documents and configure any external knowledge tools, then adapt the memory bundle to your conventions. An external search index is not created by selecting this preset.",
		icon: "book",
		runtime: "Hermes",
		modelPath: "Router profile or OpenAI-compatible endpoint",
		providerLane: "Choose Daytona, E2B, Sprites, or Vercel",
		loadout: ["update-docs", "mintlify-mdx", "read-and-review", "rtfm", "notion", "memory"],
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
		description: "A security-review prompt with threat-model and code-audit skills.",
		longDescription:
			"Start with Codex and a prompt to define trust boundaries and prioritize findings. Supply the repository and a bounded review scope, then configure any connected services. These skills guide the agent; they do not constitute a security assessment or guarantee coverage.",
		icon: "shield",
		runtime: "Codex CLI",
		modelPath: "Native OpenAI; choose a supported model",
		providerLane: "Choose Daytona, E2B, Sprites, or Vercel",
		loadout: ["security-audit", "security-best-practices", "security-threat-model", "deepsec", "sentry"],
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
		description: "An analysis prompt for explicit source data, assumptions, and reconciled totals.",
		longDescription:
			"Start with Hermes and instructions to show assumptions and reconcile source data. Supply files or configure the selected Stripe and Supabase connectors. Inspect the resulting calculations yourself; the preset is a configurable prompt and skill selection, not a verified financial workflow.",
		icon: "database",
		runtime: "Hermes",
		modelPath: "Supported router or native-provider profile",
		providerLane: "Choose Daytona, E2B, Sprites, or Vercel",
		loadout: ["db", "db-write", "read-and-review", "rtfm", "stripe", "supabase"],
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
		description: "A source-first prompt with research and writing skills for market briefs.",
		longDescription:
			"Start with Hermes and selected research, SEO, and writing skills. Configure search services, define the market question, and ask for a source-backed brief. Edit the persona and writing instructions to fit your team before using the output.",
		icon: "route",
		runtime: "Hermes",
		modelPath: "Router profile or OpenAI-compatible endpoint",
		providerLane: "Choose Daytona, E2B, Sprites, or Vercel",
		loadout: ["agent-reach", "seo-audit", "content-strategy", "copywriting", "exa", "brave-search"],
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
		title: "Build an agent harness from the parts.",
		navTitle: "Documentation",
		eyebrow: "Docs",
		description:
			"Start with a saved setup or the TypeScript SDK. Choose runtime and compute, edit instructions, configure tools, and inspect real execution. The source and guides show where each part connects and where support differs.",
		icon: "book",
		sections: [
			{ label: "Start", body: "Inspect a curated setup, save your own configuration, or import createMux from the SDK." },
			{ label: "Customize", body: "Choose a compatible runtime, model, and provider. Edit memory documents and configure the tools your task needs." },
			{ label: "Reuse", body: "Keep configurations in your account, copy or export memory as Markdown, and adapt the MIT-licensed source. Full harness export and public sharing are not implemented." },
		],
	},
	{
		slug: "api-reference",
		href: "/api-reference",
		title: "API reference",
		navTitle: "API reference",
		eyebrow: "API",
		description:
			"Find the real SDK exports and hosted endpoints for configuration, execution, lifecycle operations, and inspection. Hosted and direct-provider clients have different setup requirements.",
		icon: "braces",
		sections: [
			{ label: "Direct SDK", body: "createMux selects runtime/provider adapters and returns a machine with streaming run and PTY methods. Supply your own provider SDK dependency and credentials." },
			{ label: "Hosted client", body: "AgentMachines creates and runs a managed agent over HTTP. Create an account API key in Settings and set the hosted base URL." },
			{ label: "Control plane", body: "WorkerSpec, a store, and a runtime driver support declarative lifecycle operations. Hosted memory/profile integration is not supplied by the default direct SDK driver." },
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
