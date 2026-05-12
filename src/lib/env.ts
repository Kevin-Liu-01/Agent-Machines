/**
 * Environment loading + validation. Fails fast with a helpful message
 * when DEDALUS_API_KEY is missing instead of letting the SDK 401 silently.
 */

import "dotenv/config";

import { DEFAULTS } from "./constants.js";

export type Config = {
	apiKey: string;
	machinesBaseUrl: string;
	chatBaseUrl: string;
	model: string;
	vcpu: number;
	memoryMib: number;
	storageGib: number;
	cursorApiKey: string | null;
	autosleep: boolean;
	anthropicApiKey: string | null;
	openaiApiKey: string | null;
	aiGatewayUrl: string | null;
	aiGatewayKey: string | null;
};

function readNumber(key: string, legacyKey: string, fallback: number): number {
	const raw = process.env[key] ?? process.env[legacyKey];
	if (!raw) return fallback;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${key} must be a positive number, got "${raw}"`);
	}
	return parsed;
}

export function loadConfig(): Config {
	const apiKey = process.env.DEDALUS_API_KEY;
	if (!apiKey || apiKey === "dsk-live-replace-me") {
		throw new Error(
			"DEDALUS_API_KEY is missing. Copy .env.example to .env and set your key:\n" +
				"  cp .env.example .env\n" +
				"  echo 'DEDALUS_API_KEY=dsk-live-...' >> .env",
		);
	}

	const cursorRaw = process.env.CURSOR_API_KEY?.trim();
	const cursorApiKey =
		cursorRaw && cursorRaw !== "cursor_replace_me" ? cursorRaw : null;

	const autosleepRaw = (process.env.AGENT_AUTOSLEEP ?? process.env.HERMES_AUTOSLEEP)?.trim().toLowerCase();
	const autosleep = autosleepRaw !== "0" && autosleepRaw !== "false";

	const anthropicRaw = process.env.ANTHROPIC_API_KEY?.trim();
	const anthropicApiKey = anthropicRaw || null;

	const openaiRaw = process.env.OPENAI_API_KEY?.trim();
	const openaiApiKey = openaiRaw || null;

	const aiGatewayUrl = process.env.AI_GATEWAY_URL?.trim() || null;
	const aiGatewayKey = process.env.AI_GATEWAY_KEY?.trim() || null;

	return {
		apiKey,
		machinesBaseUrl: process.env.DEDALUS_BASE_URL ?? DEFAULTS.dedalusBaseUrl,
		chatBaseUrl: process.env.DEDALUS_CHAT_BASE_URL ?? DEFAULTS.dedalusChatBaseUrl,
		model: process.env.AGENT_MODEL ?? process.env.HERMES_MODEL ?? DEFAULTS.model,
		vcpu: readNumber("AGENT_VCPU", "HERMES_VCPU", DEFAULTS.vcpu),
		memoryMib: readNumber("AGENT_MEMORY_MIB", "HERMES_MEMORY_MIB", DEFAULTS.memoryMib),
		storageGib: readNumber("AGENT_STORAGE_GIB", "HERMES_STORAGE_GIB", DEFAULTS.storageGib),
		cursorApiKey,
		autosleep,
		anthropicApiKey,
		openaiApiKey,
		aiGatewayUrl,
		aiGatewayKey,
	};
}
