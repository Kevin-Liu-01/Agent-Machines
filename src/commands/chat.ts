/**
 * `npm run chat -- "your message"` -- single-turn streaming chat against the
 * deployed Hermes API. Falls back to stdin when no positional message is given.
 *
 * This goes through the public preview URL using the OpenAI-compatible
 * /v1/chat/completions endpoint, so any frontend that speaks OpenAI works
 * the same way.
 */

import { streamChat } from "../lib/api.js";
import { loadState } from "../lib/client.js";
import { fail, header } from "../lib/progress.js";

export async function chat(args: string[]): Promise<void> {
	const state = loadState();
	if (!state?.apiPreviewUrl) {
		fail("No deployed machine found. Run `npm run deploy` first.");
		process.exit(1);
	}

	let message = args.join(" ").trim();
	if (!message && !process.stdin.isTTY) {
		message = await new Promise<string>((resolve) => {
			let buffer = "";
			process.stdin.on("data", (chunk) => {
				buffer += chunk.toString();
			});
			process.stdin.on("end", () => resolve(buffer.trim()));
		});
	}
	if (!message) {
		console.log('Usage: npm run chat -- "your message here"');
		process.exit(1);
	}

	header(`hermes -- ${state.model}`);
	console.log(`> ${message}\n`);

	try {
		for await (const chunk of streamChat({
			apiUrl: state.apiPreviewUrl,
			apiKey: state.apiServerKey,
			messages: [{ role: "user", content: message }],
		})) {
			if (chunk.delta) process.stdout.write(chunk.delta);
		}
		process.stdout.write("\n");
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		fail(`chat failed: ${message}`);
		process.exit(1);
	}
}
