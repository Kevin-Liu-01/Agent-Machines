/**
 * Harness adapter factory. The only place that switches on HarnessKind
 * (postmortem rule: central agent-kind registry, no scattered lists).
 */

import { MuxError, type HarnessAdapter, type HarnessKind } from "../types.js";
import { claudeCodeHarness } from "./claude-code.js";
import { codexHarness } from "./codex.js";
import { openclawHarness } from "./openclaw.js";
import { hermesHarness } from "./hermes.js";

export function getHarness(kind: HarnessKind): HarnessAdapter {
	switch (kind) {
		case "claude-code":
			return claudeCodeHarness;
		case "codex":
			return codexHarness;
		case "openclaw":
			return openclawHarness;
		case "hermes":
			return hermesHarness;
		default: {
			const exhaustive: never = kind;
			throw new MuxError("fatal", `Unknown harness: ${String(exhaustive)}`);
		}
	}
}
