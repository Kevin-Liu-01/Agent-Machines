/**
 * Assemble a memory bundle into one pastable prompt: the four persona/context
 * docs in full, then a compact labeled abilities list (name + one-line
 * description, not full skill bodies, so it stays pasteable into any agent).
 */

import type { Pool } from "@/lib/dashboard/pool";
import type { MemoryBundle } from "@/lib/user-config/schema";

import { resolveAbilities, type AbilityItem } from "./abilities";

function abilitySection(title: string, items: AbilityItem[]): string[] {
	if (items.length === 0) return [];
	const lines = [`### ${title} (${items.length})`];
	for (const item of items) {
		lines.push(`- ${item.name}${item.description ? ` — ${item.description}` : ""}`);
	}
	return lines;
}

export function bundleToPrompt(bundle: MemoryBundle, pool: Pool): string {
	const parts: string[] = [`# ${bundle.name}`];
	if (bundle.description.trim()) parts.push(bundle.description.trim());

	const { docs } = bundle;
	if (docs.soul.trim()) parts.push(`## Persona & voice\n\n${docs.soul.trim()}`);
	if (docs.agentDocs.trim()) {
		parts.push(`## Operating rules & agent docs\n\n${docs.agentDocs.trim()}`);
	}
	if (docs.memory.trim()) parts.push(`## Working memory\n\n${docs.memory.trim()}`);
	if (docs.user.trim()) parts.push(`## Operator profile\n\n${docs.user.trim()}`);

	const { skills, tools, mcps } = resolveAbilities(bundle, pool);
	const abilityLines = [
		...abilitySection("Skills", skills),
		...(tools.length ? [""] : []),
		...abilitySection("Tools", tools),
		...(mcps.length ? [""] : []),
		...abilitySection("MCP servers", mcps),
	];
	if (abilityLines.length > 0) {
		parts.push(`## Abilities\n\n${abilityLines.join("\n")}`);
	}

	return `${parts.join("\n\n")}\n`;
}
