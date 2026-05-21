/**
 * Client-safe starter prompts — reads demo-config.json only.
 * Keep this free of state/config/exec-replies so ChatShell can import it.
 */

import rawConfig from "./demo-config.json";

type StarterPrompt = { label: string; prompt: string };

type JsonMachine = { starterPrompts?: StarterPrompt[] };

const machines = rawConfig.machines as Record<string, JsonMachine>;

export const STARTER_PROMPTS_BY_MACHINE: Record<
	string,
	ReadonlyArray<StarterPrompt>
> = Object.fromEntries(
	Object.entries(machines).map(([id, bundle]) => [
		id,
		bundle.starterPrompts ?? [],
	]),
);
