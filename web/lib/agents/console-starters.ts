/** Starter tasks must work across runtimes without assuming optional tools. */
export const CONSOLE_STARTERS = [
	{ label: "Meet your Worker", prompt: "Introduce yourself, inspect your current workspace, and report the tools you can actually use. Distinguish installed tools from tools that still need setup." },
	{ label: "Review this project", prompt: "Read the current project's README and top-level files. Summarize what it does and suggest the most useful next task. Do not change any files." },
	{ label: "Create your first artifact", prompt: "Create a short Markdown workspace summary at ~/.agent-machines/artifacts/workspace-summary.md. Include the current directory, a few real files you inspected, and one suggested next step. Then verify the saved file." },
	{ label: "Check Worker memory", prompt: "Read the existing memory and instructions in ~/.agent-machines. Summarize the responsibilities and context you found, without changing files or printing credentials." },
] as const;
