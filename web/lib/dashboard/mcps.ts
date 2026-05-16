/**
 * Static MCP registry. The dashboard reads from this list to render the
 * MCPs page. The source of truth on the live machine is
 * `~/.agent-machines/config.toml` -- this file is the marketing-friendly
 * reflection showing expected tool catalogs after auth/config.
 *
 * Keep tool descriptions short (1 sentence) and agent-oriented.
 */

import type { Mark } from "@/components/Logo";
import type { ServiceSlug } from "@/components/ServiceIcon";

import type { McpServerSummary } from "./types";

export type McpBrand = Mark | ServiceSlug;

export type McpServerWithBrand = McpServerSummary & {
	brand?: McpBrand;
	owner?: string;
	link?: string;
};

/* ------------------------------------------------------------------ */
/* Bundled MCPs (ship with Agent Machines)                             */
/* ------------------------------------------------------------------ */

const CURSOR_BRIDGE: McpServerWithBrand = {
	name: "cursor-bridge",
	transport: "stdio",
	source: "mcp/cursor-bridge/src/server.ts",
	brand: "cursor",
	owner: "Cursor",
	link: "https://cursor.com/docs/sdk/typescript",
	tools: [
		{
			name: "cursor_agent",
			title: "Spawn a Cursor coding agent",
			description:
				"Run a Cursor agent against a working dir for actual code changes. Inherits agent skill conventions through .cursor/rules.",
		},
		{
			name: "cursor_resume",
			title: "Resume an agent by id",
			description:
				"Continue a previous Cursor agent run with a follow-up prompt. Reuses session history and inherited skills.",
		},
		{
			name: "cursor_list_skills",
			title: "List skills available for injection",
			description:
				"Enumerate skills in ~/.agent-machines/skills so the agent can pick which conventions to load when delegating.",
		},
		{
			name: "cursor_models",
			title: "List Cursor models",
			description:
				"Surface the Cursor models the API key has access to. Useful when picking model: { id } for an agent run.",
		},
	],
};

const HERMES_BUILTINS: McpServerWithBrand = {
	name: "hermes-builtins",
	transport: "stdio",
	source: "hermes-agent (NousResearch/hermes-agent)",
	brand: "nous",
	owner: "Nous Research",
	link: "https://github.com/NousResearch/hermes-agent",
	tools: [
		{
			name: "shell_exec",
			title: "Run a shell command",
			description:
				"Execute commands in the VM's shell. Output is streamed back. Used for git, tests, file ops, system inspection.",
		},
		{
			name: "fs_read",
			title: "Read a file",
			description:
				"Read a file from the VM filesystem with optional offset/limit. Bounded output to avoid context blowup.",
		},
		{
			name: "fs_write",
			title: "Write a file",
			description:
				"Write or overwrite a file on the VM. Strict path checks keep writes inside ~/work and ~/.agent-machines by default.",
		},
		{
			name: "browser_use",
			title: "Drive a Playwright browser",
			description:
				"Navigate, click, type, screenshot. Stays inside the configured allowlist of domains.",
		},
		{
			name: "cron_create",
			title: "Schedule a recurring task",
			description:
				"Register a new cron entry with prompt + cron expression + skills. Persisted across machine sleep/wake.",
		},
		{
			name: "session_memory",
			title: "Persist session memory",
			description:
				"Append durable facts to MEMORY.md so future conversations have context without re-explaining.",
		},
	],
};

/* ------------------------------------------------------------------ */
/* SaaS platform MCPs                                                  */
/* ------------------------------------------------------------------ */

const VERCEL: McpServerWithBrand = {
	name: "vercel",
	transport: "stdio",
	source: "plugin-vercel-vercel",
	brand: "vercel",
	owner: "Vercel",
	link: "https://vercel.com/docs/mcp",
	tools: [
		{
			name: "deploy_project",
			title: "Deploy project",
			description: "Trigger a production or preview deployment for a linked project.",
		},
		{
			name: "list_deployments",
			title: "List deployments",
			description: "Fetch recent deployments with status, URL, and commit metadata.",
		},
		{
			name: "get_project",
			title: "Get project config",
			description: "Read project settings including framework, build command, and root directory.",
		},
		{
			name: "list_projects",
			title: "List projects",
			description: "Enumerate all projects in the linked Vercel team or personal account.",
		},
		{
			name: "get_env_vars",
			title: "Get environment variables",
			description: "List environment variables for a project filtered by target (production/preview/dev).",
		},
		{
			name: "set_env_var",
			title: "Set environment variable",
			description: "Create or update an env var with target and encryption settings.",
		},
		{
			name: "get_domains",
			title: "Get domains",
			description: "List custom domains attached to a project with DNS verification status.",
		},
		{
			name: "get_deployment_logs",
			title: "Get deployment logs",
			description: "Stream build or runtime logs for a specific deployment.",
		},
	],
};

const STRIPE: McpServerWithBrand = {
	name: "stripe",
	transport: "stdio",
	source: "plugin-stripe-stripe",
	brand: "stripe",
	owner: "Stripe",
	link: "https://docs.stripe.com/mcp",
	tools: [
		{
			name: "list_customers",
			title: "List customers",
			description: "Paginate through Stripe customers with optional email/metadata filters.",
		},
		{
			name: "get_customer",
			title: "Get customer",
			description: "Retrieve a single customer by ID with subscriptions and payment methods expanded.",
		},
		{
			name: "list_subscriptions",
			title: "List subscriptions",
			description: "Fetch active, past_due, or canceled subscriptions across the account.",
		},
		{
			name: "list_invoices",
			title: "List invoices",
			description: "Retrieve invoices with status, amount, and line items for a customer or globally.",
		},
		{
			name: "list_products",
			title: "List products",
			description: "Enumerate product catalog entries with prices and metadata.",
		},
		{
			name: "list_prices",
			title: "List prices",
			description: "Fetch pricing tiers and recurring intervals for a product.",
		},
		{
			name: "get_balance",
			title: "Get balance",
			description: "Read current Stripe balance including pending and available amounts by currency.",
		},
		{
			name: "search_charges",
			title: "Search charges",
			description: "Full-text search across charges by amount, status, customer, or metadata.",
		},
	],
};

const SUPABASE: McpServerWithBrand = {
	name: "supabase",
	transport: "stdio",
	source: "plugin-supabase-supabase",
	brand: "supabase",
	owner: "Supabase",
	link: "https://supabase.com/docs/guides/getting-started/mcp",
	tools: [
		{
			name: "list_projects",
			title: "List projects",
			description: "Enumerate Supabase projects in the linked org with region and status.",
		},
		{
			name: "get_schema",
			title: "Get database schema",
			description: "Inspect tables, columns, types, and foreign keys for a schema.",
		},
		{
			name: "execute_sql",
			title: "Execute SQL",
			description: "Run read-only SQL against the project's Postgres instance and return rows.",
		},
		{
			name: "get_rls_policies",
			title: "Get RLS policies",
			description: "List Row Level Security policies for a table with their SQL expressions.",
		},
		{
			name: "get_auth_config",
			title: "Get auth config",
			description: "Read authentication provider settings and JWT configuration.",
		},
		{
			name: "list_tables",
			title: "List tables",
			description: "Enumerate all tables in a schema with row counts and size estimates.",
		},
		{
			name: "get_migrations",
			title: "Get migrations",
			description: "List applied migrations with timestamps and names.",
		},
	],
};

const CLERK: McpServerWithBrand = {
	name: "clerk",
	transport: "stdio",
	source: "plugin-clerk-clerk",
	brand: "clerk",
	owner: "Clerk",
	link: "https://clerk.com/docs/mcp",
	tools: [
		{
			name: "list_users",
			title: "List users",
			description: "Paginate users with optional email/phone/username search filters.",
		},
		{
			name: "get_user",
			title: "Get user",
			description: "Retrieve a user by ID with all identifiers, metadata, and session info.",
		},
		{
			name: "list_organizations",
			title: "List organizations",
			description: "Enumerate orgs with member counts and metadata.",
		},
		{
			name: "get_organization",
			title: "Get organization",
			description: "Read org details including members, roles, and pending invitations.",
		},
		{
			name: "list_sessions",
			title: "List sessions",
			description: "Fetch active sessions for a user with device and IP info.",
		},
		{
			name: "get_auth_config",
			title: "Get auth configuration",
			description: "Read sign-in/sign-up settings, social providers, and MFA configuration.",
		},
	],
};

const FIREBASE: McpServerWithBrand = {
	name: "firebase",
	transport: "stdio",
	source: "plugin-firebase-firebase",
	brand: "firebase",
	owner: "Google",
	link: "https://firebase.google.com/docs/mcp",
	tools: [
		{
			name: "firebase_list_projects",
			title: "List projects",
			description: "Enumerate Firebase projects in the authenticated account.",
		},
		{
			name: "firebase_get_project",
			title: "Get project",
			description: "Read project configuration including default resources and linked apps.",
		},
		{
			name: "firebase_create_project",
			title: "Create project",
			description: "Provision a new Firebase project with specified ID and display name.",
		},
		{
			name: "firebase_list_apps",
			title: "List apps",
			description: "Enumerate registered apps (web, iOS, Android) for a project.",
		},
		{
			name: "firebase_create_app",
			title: "Create app",
			description: "Register a new platform app in the project.",
		},
		{
			name: "firebase_get_sdk_config",
			title: "Get SDK config",
			description: "Retrieve the client SDK configuration snippet for a registered app.",
		},
		{
			name: "firebase_init",
			title: "Initialize project",
			description: "Set up local Firebase config files for hosting, Firestore, auth, or functions.",
		},
		{
			name: "firebase_deploy",
			title: "Deploy",
			description: "Deploy hosting, rules, functions, or all targets to the live project.",
		},
		{
			name: "firebase_deploy_status",
			title: "Deploy status",
			description: "Check the progress and result of a running or recent deploy.",
		},
		{
			name: "firebase_get_security_rules",
			title: "Get security rules",
			description: "Read Firestore or Storage security rules for the project.",
		},
		{
			name: "firebase_read_resources",
			title: "Read resources",
			description: "Inspect provisioned resources like Firestore databases, Storage buckets, or Auth config.",
		},
		{
			name: "firebase_get_environment",
			title: "Get environment",
			description: "Read environment variables and runtime configuration for Cloud Functions.",
		},
		{
			name: "firebase_update_environment",
			title: "Update environment",
			description: "Set environment variables for Cloud Functions.",
		},
		{
			name: "developerknowledge_search_documents",
			title: "Search docs",
			description: "Full-text search over Firebase documentation for implementation guidance.",
		},
		{
			name: "developerknowledge_answer_query",
			title: "Answer query",
			description: "Get an AI-generated answer grounded in Firebase documentation.",
		},
	],
};

const FIGMA: McpServerWithBrand = {
	name: "figma",
	transport: "stdio",
	source: "plugin-figma-figma",
	brand: "figma",
	owner: "Figma",
	link: "https://figma.com/developers/mcp",
	tools: [
		{
			name: "get_file",
			title: "Get file",
			description: "Read a Figma file's full node tree with styles, components, and layout.",
		},
		{
			name: "get_node",
			title: "Get node",
			description: "Inspect a specific node by ID with properties, constraints, and fills.",
		},
		{
			name: "get_styles",
			title: "Get styles",
			description: "List published styles (color, text, effect, grid) from a file or library.",
		},
		{
			name: "get_components",
			title: "Get components",
			description: "Enumerate published components and component sets with variant properties.",
		},
		{
			name: "use_figma",
			title: "Execute Plugin API",
			description: "Run arbitrary JavaScript in the Figma file context via the Plugin API.",
		},
		{
			name: "create_new_file",
			title: "Create new file",
			description: "Create a blank Figma design, FigJam, or Slides file in a specified project.",
		},
		{
			name: "generate_diagram",
			title: "Generate diagram",
			description: "Render a Mermaid diagram (flowchart, sequence, ERD) into FigJam.",
		},
		{
			name: "search_library",
			title: "Search library",
			description: "Search team library components and styles by name or description.",
		},
	],
};

const POSTHOG: McpServerWithBrand = {
	name: "posthog",
	transport: "stdio",
	source: "plugin-posthog-posthog",
	brand: "posthog",
	owner: "PostHog",
	link: "https://posthog.com/docs/mcp",
	tools: [
		{
			name: "query_hogql",
			title: "Query HogQL",
			description: "Execute HogQL (SQL-like) analytics queries against event data.",
		},
		{
			name: "get_events",
			title: "Get events",
			description: "Fetch raw events with property filters, date range, and person info.",
		},
		{
			name: "list_feature_flags",
			title: "List feature flags",
			description: "Enumerate feature flags with rollout percentages and targeting rules.",
		},
		{
			name: "get_session_replays",
			title: "Get session replays",
			description: "List session recordings matching filter criteria with duration and activity.",
		},
		{
			name: "list_experiments",
			title: "List experiments",
			description: "Fetch A/B tests with variants, goals, and statistical significance.",
		},
		{
			name: "get_persons",
			title: "Get persons",
			description: "Look up person profiles with properties and event history.",
		},
	],
};

const SENTRY: McpServerWithBrand = {
	name: "sentry",
	transport: "stdio",
	source: "plugin-sentry-sentry",
	brand: "sentry",
	owner: "Sentry",
	link: "https://docs.sentry.io/product/integrations/mcp/",
	tools: [
		{
			name: "list_issues",
			title: "List issues",
			description: "Fetch unresolved issues sorted by frequency, users affected, or last seen.",
		},
		{
			name: "get_issue",
			title: "Get issue",
			description: "Read issue details including stack trace, tags, and assigned owner.",
		},
		{
			name: "get_event",
			title: "Get event",
			description: "Retrieve a specific error event with full context, breadcrumbs, and request data.",
		},
		{
			name: "list_alerts",
			title: "List alerts",
			description: "Enumerate alert rules and their current trigger status.",
		},
		{
			name: "get_release_health",
			title: "Get release health",
			description: "Read crash-free session/user rates and adoption metrics for a release.",
		},
		{
			name: "search_events",
			title: "Search events",
			description: "Full-text search across error events with tag and property filters.",
		},
	],
};

const DATADOG: McpServerWithBrand = {
	name: "datadog",
	transport: "stdio",
	source: "plugin-datadog-datadog",
	brand: "datadog",
	owner: "Datadog",
	link: "https://docs.datadoghq.com/integrations/mcp/",
	tools: [
		{
			name: "query_logs",
			title: "Query logs",
			description: "Search and filter logs with facets, time range, and pattern matching.",
		},
		{
			name: "query_metrics",
			title: "Query metrics",
			description: "Execute metric queries with aggregation, grouping, and formulas.",
		},
		{
			name: "get_traces",
			title: "Get traces",
			description: "Fetch distributed traces by service, operation, or trace ID.",
		},
		{
			name: "list_dashboards",
			title: "List dashboards",
			description: "Enumerate dashboards with titles and widget summaries.",
		},
		{
			name: "list_monitors",
			title: "List monitors",
			description: "Fetch monitors with current status, thresholds, and notification targets.",
		},
		{
			name: "get_incidents",
			title: "Get incidents",
			description: "Read active or recent incidents with severity, commander, and timeline.",
		},
	],
};

const LINEAR: McpServerWithBrand = {
	name: "linear",
	transport: "stdio",
	source: "plugin-linear-linear",
	brand: "linear",
	owner: "Linear",
	link: "https://linear.app/docs/mcp",
	tools: [
		{
			name: "list_issues",
			title: "List issues",
			description: "Fetch issues with filters for status, assignee, label, project, or cycle.",
		},
		{
			name: "create_issue",
			title: "Create issue",
			description: "Create a new issue with title, description, assignee, labels, and project.",
		},
		{
			name: "update_issue",
			title: "Update issue",
			description: "Modify issue properties like status, priority, assignee, or labels.",
		},
		{
			name: "list_projects",
			title: "List projects",
			description: "Enumerate projects with progress, lead, and target date.",
		},
		{
			name: "list_cycles",
			title: "List cycles",
			description: "Fetch current and upcoming cycles with issue counts and completion stats.",
		},
		{
			name: "search_issues",
			title: "Search issues",
			description: "Full-text search across issues, comments, and project documents.",
		},
	],
};

const SLACK: McpServerWithBrand = {
	name: "slack",
	transport: "stdio",
	source: "plugin-slack-slack",
	brand: "slack",
	owner: "Slack",
	link: "https://api.slack.com/docs/mcp",
	tools: [
		{
			name: "list_channels",
			title: "List channels",
			description: "Enumerate workspace channels with membership status and topic.",
		},
		{
			name: "send_message",
			title: "Send message",
			description: "Post a message to a channel or thread with optional blocks and attachments.",
		},
		{
			name: "search_messages",
			title: "Search messages",
			description: "Full-text search across messages with channel, user, and date filters.",
		},
		{
			name: "get_thread",
			title: "Get thread",
			description: "Fetch all replies in a message thread with user info and timestamps.",
		},
		{
			name: "list_users",
			title: "List users",
			description: "Enumerate workspace members with display name, status, and timezone.",
		},
	],
};

const SANITY: McpServerWithBrand = {
	name: "sanity",
	transport: "stdio",
	source: "plugin-sanity-Sanity",
	brand: "sanity" as McpBrand,
	owner: "Sanity",
	link: "https://www.sanity.io/docs/mcp",
	tools: [
		{
			name: "groq_query",
			title: "GROQ query",
			description: "Execute a GROQ query against the content lake and return matching documents.",
		},
		{
			name: "get_schema",
			title: "Get schema",
			description: "Inspect document types, fields, and validation rules for the dataset.",
		},
		{
			name: "list_datasets",
			title: "List datasets",
			description: "Enumerate datasets in the project with visibility and ACL settings.",
		},
		{
			name: "get_document",
			title: "Get document",
			description: "Fetch a single document by ID with all fields and references expanded.",
		},
		{
			name: "mutate_document",
			title: "Mutate document",
			description: "Create, patch, or delete documents with transaction support.",
		},
		{
			name: "search_content",
			title: "Search content",
			description: "Full-text search across the content lake with type and field filters.",
		},
	],
};

const CLICKHOUSE: McpServerWithBrand = {
	name: "clickhouse",
	transport: "stdio",
	source: "plugin-clickhouse-cursor-plugin-clickhouse",
	brand: "clickhouse",
	owner: "ClickHouse",
	link: "https://clickhouse.com/docs/en/integrations/mcp",
	tools: [
		{
			name: "execute_query",
			title: "Execute query",
			description: "Run a ClickHouse SQL query and return the result set.",
		},
		{
			name: "describe_table",
			title: "Describe table",
			description: "Inspect columns, types, codec, and TTL for a table.",
		},
		{
			name: "list_tables",
			title: "List tables",
			description: "Enumerate tables in a database with engine, row count, and size.",
		},
		{
			name: "list_databases",
			title: "List databases",
			description: "List all databases on the connected ClickHouse cluster.",
		},
		{
			name: "get_query_log",
			title: "Get query log",
			description: "Fetch recent query executions with duration, read rows, and memory usage.",
		},
	],
};

/* ------------------------------------------------------------------ */
/* IDE / browser MCPs                                                  */
/* ------------------------------------------------------------------ */

const PLAYWRIGHT: McpServerWithBrand = {
	name: "playwright",
	transport: "stdio",
	source: "@playwright/mcp",
	brand: "playwright",
	owner: "Microsoft",
	link: "https://playwright.dev/docs/mcp",
	tools: [
		{
			name: "browser_navigate",
			title: "Navigate",
			description: "Go to a URL and wait for the page to reach a stable load state.",
		},
		{
			name: "browser_click",
			title: "Click element",
			description: "Click an element by accessible ref from a prior snapshot.",
		},
		{
			name: "browser_type",
			title: "Type text",
			description: "Type into the currently focused element or a specified ref.",
		},
		{
			name: "browser_snapshot",
			title: "Page snapshot",
			description: "Return a YAML accessibility tree with refs for subsequent actions.",
		},
		{
			name: "browser_take_screenshot",
			title: "Screenshot",
			description: "Capture a PNG of the viewport or a specific element.",
		},
		{
			name: "browser_evaluate",
			title: "Evaluate JS",
			description: "Execute JavaScript in the page context and return the result.",
		},
		{
			name: "browser_fill_form",
			title: "Fill form",
			description: "Fill multiple form fields at once from a key-value mapping.",
		},
		{
			name: "browser_hover",
			title: "Hover",
			description: "Hover over an element to trigger tooltips or dropdowns.",
		},
		{
			name: "browser_select_option",
			title: "Select option",
			description: "Choose a value from a select/dropdown element.",
		},
		{
			name: "browser_press_key",
			title: "Press key",
			description: "Dispatch a keyboard event (Enter, Escape, Tab, shortcuts).",
		},
		{
			name: "browser_drag",
			title: "Drag",
			description: "Perform a drag operation between two elements or coordinates.",
		},
		{
			name: "browser_file_upload",
			title: "Upload file",
			description: "Attach files to a file input element.",
		},
		{
			name: "browser_handle_dialog",
			title: "Handle dialog",
			description: "Accept or dismiss alert, confirm, or prompt dialogs.",
		},
		{
			name: "browser_network_requests",
			title: "Network requests",
			description: "List captured network requests with method, URL, status, and size.",
		},
		{
			name: "browser_console_messages",
			title: "Console messages",
			description: "Fetch captured console output (log, warn, error) from the page.",
		},
		{
			name: "browser_tabs",
			title: "List tabs",
			description: "Enumerate open browser tabs with titles and URLs.",
		},
		{
			name: "browser_navigate_back",
			title: "Navigate back",
			description: "Go back one entry in the browser history.",
		},
		{
			name: "browser_resize",
			title: "Resize viewport",
			description: "Set the browser viewport to a specific width and height.",
		},
		{
			name: "browser_wait_for",
			title: "Wait for",
			description: "Block until a selector appears, disappears, or a network request completes.",
		},
		{
			name: "browser_close",
			title: "Close browser",
			description: "Terminate the browser session and release resources.",
		},
	],
};

const CHROME_DEVTOOLS: McpServerWithBrand = {
	name: "chrome-devtools",
	transport: "stdio",
	source: "Chrome DevTools Protocol",
	brand: "googlechrome",
	owner: "Google",
	link: "https://chromedevtools.github.io/devtools-protocol/",
	tools: [
		{
			name: "navigate_page",
			title: "Navigate page",
			description: "Load a URL in the inspected tab and wait for network idle.",
		},
		{
			name: "click",
			title: "Click",
			description: "Click an element by CSS selector or coordinates.",
		},
		{
			name: "type_text",
			title: "Type text",
			description: "Type into a focused input field character by character.",
		},
		{
			name: "fill",
			title: "Fill input",
			description: "Set an input's value directly (faster than type for long strings).",
		},
		{
			name: "fill_form",
			title: "Fill form",
			description: "Populate multiple form fields from a mapping object.",
		},
		{
			name: "take_snapshot",
			title: "DOM snapshot",
			description: "Capture the page's accessibility tree for element discovery.",
		},
		{
			name: "take_screenshot",
			title: "Screenshot",
			description: "Capture a PNG of the viewport or a clipped region.",
		},
		{
			name: "evaluate_script",
			title: "Evaluate script",
			description: "Execute JavaScript in the page context via CDP Runtime.evaluate.",
		},
		{
			name: "lighthouse_audit",
			title: "Lighthouse audit",
			description: "Run a Lighthouse audit and return performance, accessibility, and SEO scores.",
		},
		{
			name: "performance_start_trace",
			title: "Start perf trace",
			description: "Begin a CDP performance trace for profiling CPU/rendering.",
		},
		{
			name: "performance_stop_trace",
			title: "Stop perf trace",
			description: "End the trace and return the profile data.",
		},
		{
			name: "performance_analyze_insight",
			title: "Analyze performance",
			description: "Generate insights from a captured performance trace.",
		},
		{
			name: "list_network_requests",
			title: "List network requests",
			description: "Fetch captured requests with method, URL, status, timing, and size.",
		},
		{
			name: "get_network_request",
			title: "Get request body",
			description: "Read the full response body of a captured network request.",
		},
		{
			name: "list_console_messages",
			title: "List console messages",
			description: "Fetch console output captured during the session.",
		},
		{
			name: "take_memory_snapshot",
			title: "Memory snapshot",
			description: "Capture a heap snapshot for memory leak investigation.",
		},
		{
			name: "emulate",
			title: "Emulate device",
			description: "Set device metrics, user agent, and touch emulation.",
		},
		{
			name: "list_pages",
			title: "List pages",
			description: "Enumerate inspectable targets (tabs, service workers, extensions).",
		},
		{
			name: "hover",
			title: "Hover",
			description: "Dispatch a mouse hover event on a selector or coordinates.",
		},
	],
};

const GITLENS: McpServerWithBrand = {
	name: "gitlens",
	transport: "stdio",
	source: "GitLens extension (GitKraken)",
	brand: "github",
	owner: "GitKraken",
	link: "https://gitkraken.com/gitlens",
	tools: [
		{
			name: "git_blame",
			title: "Blame",
			description: "Annotate file lines with commit hash, author, and date.",
		},
		{
			name: "git_log_or_diff",
			title: "Log / diff",
			description: "View commit history or diffs between refs for a file or repo.",
		},
		{
			name: "git_status",
			title: "Status",
			description: "Show working directory and staging area changes.",
		},
		{
			name: "git_branch",
			title: "Branch",
			description: "Create, list, rename, or delete branches.",
		},
		{
			name: "git_checkout",
			title: "Checkout",
			description: "Switch branches or restore working tree files.",
		},
		{
			name: "git_stash",
			title: "Stash",
			description: "Save or restore uncommitted changes.",
		},
		{
			name: "git_worktree",
			title: "Worktree",
			description: "Manage multiple working trees for parallel branch work.",
		},
		{
			name: "git_add_or_commit",
			title: "Add / commit",
			description: "Stage changes and create commits with messages.",
		},
		{
			name: "git_push",
			title: "Push",
			description: "Push local commits to a remote.",
		},
		{
			name: "git_pull",
			title: "Pull",
			description: "Fetch and integrate remote changes.",
		},
		{
			name: "git_fetch",
			title: "Fetch",
			description: "Download objects and refs from a remote without merging.",
		},
		{
			name: "git_graph",
			title: "Graph",
			description: "Visualize commit graph with branch topology.",
		},
		{
			name: "gitlens_launchpad",
			title: "Launchpad",
			description: "Open the GitLens launchpad with PRs, issues, and code suggestions.",
		},
		{
			name: "gitlens_commit_composer",
			title: "Commit composer",
			description: "AI-assisted commit message generation from staged changes.",
		},
		{
			name: "gitlens_start_work",
			title: "Start work",
			description: "Create a branch from an issue and link it for auto-status updates.",
		},
		{
			name: "gitlens_start_review",
			title: "Start review",
			description: "Begin a PR code review workflow with inline comments.",
		},
		{
			name: "pull_request_create",
			title: "Create PR",
			description: "Open a pull request with title, description, and reviewers.",
		},
		{
			name: "pull_request_get_detail",
			title: "Get PR details",
			description: "Read PR metadata, checks, comments, and review status.",
		},
		{
			name: "pull_request_get_comments",
			title: "Get PR comments",
			description: "Fetch inline and conversation comments on a pull request.",
		},
		{
			name: "issues_get_detail",
			title: "Get issue",
			description: "Read issue details with labels, assignees, and linked PRs.",
		},
		{
			name: "issues_assigned_to_me",
			title: "My issues",
			description: "List issues assigned to the authenticated user.",
		},
	],
};

const CURSOR_IDE_BROWSER: McpServerWithBrand = {
	name: "cursor-ide-browser",
	transport: "stdio",
	source: "Cursor built-in browser",
	brand: "cursor",
	owner: "Cursor",
	link: "https://cursor.com",
	tools: [
		{
			name: "browser_navigate",
			title: "Navigate",
			description: "Go to a URL in the IDE's embedded browser.",
		},
		{
			name: "browser_click",
			title: "Click",
			description: "Click an element by ref or selector.",
		},
		{
			name: "browser_type",
			title: "Type",
			description: "Type text into the focused element.",
		},
		{
			name: "browser_snapshot",
			title: "Snapshot",
			description: "Capture an accessibility tree snapshot with action refs.",
		},
		{
			name: "browser_take_screenshot",
			title: "Screenshot",
			description: "Capture a PNG of the current viewport.",
		},
		{
			name: "browser_highlight",
			title: "Highlight element",
			description: "Draw a visual highlight around an element for inspection.",
		},
		{
			name: "browser_scroll",
			title: "Scroll",
			description: "Scroll the page or a specific container by offset.",
		},
		{
			name: "browser_search",
			title: "Search page",
			description: "Find text on the page and navigate between matches.",
		},
		{
			name: "browser_fill",
			title: "Fill input",
			description: "Set an input value directly.",
		},
		{
			name: "browser_fill_form",
			title: "Fill form",
			description: "Populate multiple form fields from a mapping.",
		},
		{
			name: "browser_select_option",
			title: "Select option",
			description: "Choose a dropdown option by value or label.",
		},
		{
			name: "browser_hover",
			title: "Hover",
			description: "Hover over an element to trigger hover states.",
		},
		{
			name: "browser_press_key",
			title: "Press key",
			description: "Dispatch keyboard events.",
		},
		{
			name: "browser_tabs",
			title: "List tabs",
			description: "Enumerate open browser tabs.",
		},
		{
			name: "browser_resize",
			title: "Resize",
			description: "Set the viewport dimensions.",
		},
		{
			name: "browser_navigate_back",
			title: "Back",
			description: "Navigate back in history.",
		},
		{
			name: "browser_network_requests",
			title: "Network",
			description: "List captured network requests.",
		},
		{
			name: "browser_console_messages",
			title: "Console",
			description: "Fetch captured console messages.",
		},
		{
			name: "browser_profile_start",
			title: "Start profile",
			description: "Begin a CPU/rendering performance profile.",
		},
		{
			name: "browser_profile_stop",
			title: "Stop profile",
			description: "End profiling and return results.",
		},
		{
			name: "browser_lock",
			title: "Lock session",
			description: "Prevent other tools from interacting with the browser until unlocked.",
		},
		{
			name: "browser_wait_for",
			title: "Wait for",
			description: "Block until a selector or network condition is met.",
		},
		{
			name: "browser_drag",
			title: "Drag",
			description: "Perform drag operations between elements.",
		},
		{
			name: "browser_handle_dialog",
			title: "Handle dialog",
			description: "Accept or dismiss native dialogs.",
		},
		{
			name: "browser_mouse_click_xy",
			title: "Click XY",
			description: "Click at exact pixel coordinates.",
		},
		{
			name: "browser_get_bounding_box",
			title: "Get bounding box",
			description: "Return the position and size of an element.",
		},
	],
};

const CURSOR_APP_CONTROL: McpServerWithBrand = {
	name: "cursor-app-control",
	transport: "stdio",
	source: "Cursor IDE internals",
	brand: "cursor",
	owner: "Cursor",
	link: "https://cursor.com",
	tools: [
		{
			name: "create_project",
			title: "Create project",
			description: "Scaffold a new Cursor project in the workspace with template selection.",
		},
		{
			name: "move_agent_to_root",
			title: "Move agent to root",
			description: "Reset the agent's working directory to the workspace root.",
		},
	],
};

/* ------------------------------------------------------------------ */
/* Ecosystem MCPs (new additions)                                      */
/* ------------------------------------------------------------------ */

const NEON: McpServerWithBrand = {
	name: "neon",
	transport: "stdio",
	source: "@neondatabase/mcp-server-neon",
	brand: "neon" as McpBrand,
	owner: "Neon",
	link: "https://neon.tech/docs/mcp",
	tools: [
		{
			name: "create_branch",
			title: "Create branch",
			description: "Fork the database into an isolated branch for testing or migrations.",
		},
		{
			name: "run_sql",
			title: "Run SQL",
			description: "Execute SQL against a branch and return results.",
		},
		{
			name: "list_branches",
			title: "List branches",
			description: "Enumerate database branches with parent, status, and compute size.",
		},
		{
			name: "get_schema",
			title: "Get schema",
			description: "Inspect tables, columns, indexes, and constraints.",
		},
		{
			name: "list_projects",
			title: "List projects",
			description: "Fetch Neon projects in the account with region and plan.",
		},
		{
			name: "get_connection_string",
			title: "Get connection string",
			description: "Retrieve the pooled or direct Postgres connection URI for a branch.",
		},
	],
};

const UPSTASH: McpServerWithBrand = {
	name: "upstash",
	transport: "stdio",
	source: "@upstash/mcp-server",
	brand: "upstash" as McpBrand,
	owner: "Upstash",
	link: "https://upstash.com/docs/mcp",
	tools: [
		{
			name: "redis_get",
			title: "Redis GET",
			description: "Read a value by key from the serverless Redis instance.",
		},
		{
			name: "redis_set",
			title: "Redis SET",
			description: "Write a key-value pair with optional TTL.",
		},
		{
			name: "redis_del",
			title: "Redis DEL",
			description: "Delete one or more keys.",
		},
		{
			name: "redis_scan",
			title: "Redis SCAN",
			description: "Iterate keys matching a pattern with cursor-based pagination.",
		},
		{
			name: "redis_hgetall",
			title: "Redis HGETALL",
			description: "Read all fields and values of a hash.",
		},
		{
			name: "qstash_publish",
			title: "QStash publish",
			description: "Publish a message to a QStash topic or URL with delivery guarantees.",
		},
		{
			name: "qstash_schedule",
			title: "QStash schedule",
			description: "Create a recurring scheduled message with cron expression.",
		},
	],
};

const TURSO: McpServerWithBrand = {
	name: "turso",
	transport: "stdio",
	source: "@tursodatabase/mcp-server",
	brand: "turso" as McpBrand,
	owner: "Turso",
	link: "https://turso.tech/docs/mcp",
	tools: [
		{
			name: "execute_query",
			title: "Execute query",
			description: "Run a SQL query against an edge SQLite database and return rows.",
		},
		{
			name: "list_databases",
			title: "List databases",
			description: "Enumerate databases in the org with region and group.",
		},
		{
			name: "create_database",
			title: "Create database",
			description: "Provision a new edge database in a specified group and region.",
		},
		{
			name: "get_schema",
			title: "Get schema",
			description: "Inspect tables, columns, and indexes of a Turso database.",
		},
		{
			name: "get_database_stats",
			title: "Get stats",
			description: "Read row count, size on disk, and read/write operations.",
		},
	],
};

const RESEND: McpServerWithBrand = {
	name: "resend",
	transport: "stdio",
	source: "resend-mcp",
	brand: "resend" as McpBrand,
	owner: "Resend",
	link: "https://resend.com/docs/mcp",
	tools: [
		{
			name: "send_email",
			title: "Send email",
			description: "Send a transactional email with HTML/text body, attachments, and headers.",
		},
		{
			name: "list_emails",
			title: "List emails",
			description: "Fetch sent emails with delivery status, opens, and clicks.",
		},
		{
			name: "get_email",
			title: "Get email",
			description: "Read a single email's full details including delivery events.",
		},
		{
			name: "create_domain",
			title: "Create domain",
			description: "Add a sending domain and get DNS records for verification.",
		},
		{
			name: "list_contacts",
			title: "List contacts",
			description: "Paginate contacts in an audience with subscription status.",
		},
		{
			name: "create_contact",
			title: "Create contact",
			description: "Add a contact to an audience with custom fields.",
		},
	],
};

const NOTION: McpServerWithBrand = {
	name: "notion",
	transport: "stdio",
	source: "notion-mcp",
	brand: "notion" as McpBrand,
	owner: "Notion",
	link: "https://developers.notion.com/docs/mcp",
	tools: [
		{
			name: "search_pages",
			title: "Search pages",
			description: "Full-text search across workspace pages and databases.",
		},
		{
			name: "get_page",
			title: "Get page",
			description: "Read a page's properties and content blocks.",
		},
		{
			name: "create_page",
			title: "Create page",
			description: "Create a page in a database or as a child of another page.",
		},
		{
			name: "query_database",
			title: "Query database",
			description: "Filter and sort a Notion database with property conditions.",
		},
		{
			name: "update_block",
			title: "Update block",
			description: "Modify a content block's text, type, or children.",
		},
		{
			name: "append_blocks",
			title: "Append blocks",
			description: "Add content blocks to the end of a page.",
		},
	],
};

const BRAVE_SEARCH: McpServerWithBrand = {
	name: "brave-search",
	transport: "stdio",
	source: "@anthropic/mcp-server-brave",
	brand: "brave" as McpBrand,
	owner: "Brave",
	link: "https://brave.com/search/api/",
	tools: [
		{
			name: "brave_web_search",
			title: "Web search",
			description: "Search the web with Brave's independent index and return ranked results.",
		},
		{
			name: "brave_local_search",
			title: "Local search",
			description: "Search for local businesses and places with ratings and hours.",
		},
	],
};

const EXA: McpServerWithBrand = {
	name: "exa",
	transport: "stdio",
	source: "exa-mcp-server",
	brand: "exa" as McpBrand,
	owner: "Exa",
	link: "https://exa.ai/docs",
	tools: [
		{
			name: "search",
			title: "Semantic search",
			description: "Neural search that understands meaning, not just keywords.",
		},
		{
			name: "get_contents",
			title: "Get contents",
			description: "Extract clean text content from URLs returned by search.",
		},
		{
			name: "find_similar",
			title: "Find similar",
			description: "Discover pages semantically similar to a given URL.",
		},
	],
};

const MEMORY: McpServerWithBrand = {
	name: "memory",
	transport: "stdio",
	source: "@anthropic/mcp-server-memory",
	brand: "anthropic",
	owner: "Anthropic",
	link: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
	tools: [
		{
			name: "create_entities",
			title: "Create entities",
			description: "Add named nodes to the persistent knowledge graph.",
		},
		{
			name: "create_relations",
			title: "Create relations",
			description: "Link entities with typed, directed edges.",
		},
		{
			name: "search_nodes",
			title: "Search nodes",
			description: "Query the knowledge graph by name, type, or observation text.",
		},
		{
			name: "add_observations",
			title: "Add observations",
			description: "Attach facts or notes to existing entities.",
		},
		{
			name: "read_graph",
			title: "Read graph",
			description: "Load the entire knowledge graph for context injection.",
		},
		{
			name: "delete_entities",
			title: "Delete entities",
			description: "Remove nodes and their connected relations from the graph.",
		},
	],
};

const CLOUDFLARE_WORKERS: McpServerWithBrand = {
	name: "cloudflare-workers",
	transport: "stdio",
	source: "@cloudflare/mcp-server-cloudflare",
	brand: "cloudflare",
	owner: "Cloudflare",
	link: "https://developers.cloudflare.com/mcp/",
	tools: [
		{
			name: "deploy_worker",
			title: "Deploy Worker",
			description: "Deploy or update a Cloudflare Worker script to production or preview.",
		},
		{
			name: "kv_get",
			title: "KV get",
			description: "Read a value from a Workers KV namespace.",
		},
		{
			name: "kv_put",
			title: "KV put",
			description: "Write a key-value pair to a Workers KV namespace with optional TTL.",
		},
		{
			name: "d1_query",
			title: "D1 query",
			description: "Execute a SQL query against a Cloudflare D1 SQLite database.",
		},
		{
			name: "r2_upload",
			title: "R2 upload",
			description: "Upload an object to an R2 storage bucket.",
		},
		{
			name: "r2_list",
			title: "R2 list",
			description: "List objects in an R2 bucket with prefix filtering.",
		},
		{
			name: "list_workers",
			title: "List Workers",
			description: "Enumerate deployed Workers with routes and last-deploy timestamps.",
		},
	],
};

const GRAFANA: McpServerWithBrand = {
	name: "grafana",
	transport: "stdio",
	source: "grafana-mcp-server",
	brand: "grafana" as McpBrand,
	owner: "Grafana Labs",
	link: "https://grafana.com/docs/grafana-cloud/mcp/",
	tools: [
		{
			name: "query_datasource",
			title: "Query datasource",
			description: "Execute a query against any configured datasource (Prometheus, Loki, Tempo, etc.).",
		},
		{
			name: "list_dashboards",
			title: "List dashboards",
			description: "Enumerate dashboards with folder, tags, and last-modified info.",
		},
		{
			name: "get_dashboard",
			title: "Get dashboard",
			description: "Read a dashboard's panels, queries, and variables.",
		},
		{
			name: "list_alerts",
			title: "List alerts",
			description: "Fetch firing and pending alert rules with labels and annotations.",
		},
		{
			name: "search_logs",
			title: "Search logs",
			description: "Query Loki logs with LogQL and return matching log lines.",
		},
		{
			name: "list_datasources",
			title: "List datasources",
			description: "Enumerate configured datasources with type, URL, and access mode.",
		},
	],
};

/* ------------------------------------------------------------------ */
/* Registry export                                                     */
/* ------------------------------------------------------------------ */

export function listMcpServers(): McpServerWithBrand[] {
	return [
		// Bundled
		CURSOR_BRIDGE,
		HERMES_BUILTINS,
		// SaaS platforms
		VERCEL,
		STRIPE,
		SUPABASE,
		CLERK,
		FIREBASE,
		FIGMA,
		POSTHOG,
		SENTRY,
		DATADOG,
		LINEAR,
		SLACK,
		SANITY,
		CLICKHOUSE,
		// IDE / browser
		PLAYWRIGHT,
		CHROME_DEVTOOLS,
		GITLENS,
		CURSOR_IDE_BROWSER,
		CURSOR_APP_CONTROL,
		// Ecosystem
		NEON,
		UPSTASH,
		TURSO,
		RESEND,
		NOTION,
		BRAVE_SEARCH,
		EXA,
		MEMORY,
		CLOUDFLARE_WORKERS,
		GRAFANA,
	];
}
