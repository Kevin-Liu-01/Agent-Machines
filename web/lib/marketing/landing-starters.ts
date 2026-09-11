import presets from "@/data/presets.json";
import type { Mark } from "@/components/Logo";

const STARTER_PRESENTATION = [
	{ id: "coding-agent", label: "Build software", description: "Start with code, a repository, and a clear task." },
	{ id: "deep-research", label: "Explore a topic", description: "Bring your questions and build useful context." },
	{ id: "computer-use", label: "Work in the browser", description: "Configure a setup for browser-based work." },
] as const;

export type LandingStarterId = (typeof STARTER_PRESENTATION)[number]["id"];

const RUNTIME_MARKS: Record<string, { runtimeLabel: string; mark: Mark }> = {
	"claude-code": { runtimeLabel: "Claude Code", mark: "claudecode" },
	codex: { runtimeLabel: "Codex", mark: "codex" },
	hermes: { runtimeLabel: "Hermes", mark: "nous" },
	openclaw: { runtimeLabel: "OpenClaw", mark: "openclaw" },
};

/** Only real committed presets can be offered by the public starter picker. */
export const LANDING_STARTERS = STARTER_PRESENTATION.map((presentation) => {
	const preset = presets.find((item) => item.id === presentation.id);
	const runtime = preset && RUNTIME_MARKS[preset.agentKind];
	if (!preset || !runtime) throw new Error(`Missing landing starter or runtime: ${presentation.id}`);
	return { ...presentation, runtime: preset.agentKind, ...runtime };
});

/** The existing dashboard route validates and previews this preset before saving. */
export function landingStarterHref(id: LandingStarterId): string {
	if (!LANDING_STARTERS.some((starter) => starter.id === id)) return "/dashboard/agents";
	return `/dashboard/agents?${new URLSearchParams({ preset: id })}`;
}
