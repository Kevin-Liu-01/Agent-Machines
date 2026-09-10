import { createElement, type ReactNode } from "react";
import rehypeHighlight from "rehype-highlight";
import { VFile } from "vfile";

type Highlight = ReturnType<typeof rehypeHighlight>;
type Root = Parameters<Highlight>[0];
type Element = Extract<Root["children"][number], { type: "element" }>;
type Node = Element["children"][number];

// Used only by the server-rendered SDK section. The existing rehype package
// registers TypeScript's full grammar; no autodetection or browser highlighter.
const highlight = rehypeHighlight({ detect: false });

/** Highlight the whole source so comments, template strings and types keep context. */
export function highlightTypeScript(source: string): ReactNode[] {
	const code: Element = {
		type: "element", tagName: "code", properties: { className: ["language-typescript"] },
		children: [{ type: "text", value: source }],
	};
	const tree: Root = {
		type: "root",
		children: [{ type: "element", tagName: "pre", properties: {}, children: [code] }],
	};
	const file = new VFile({ value: source, path: "reviewer.ts" });
	highlight(tree, file);
	// Do not silently ship unhighlighted code if grammar registration changes.
	if (file.messages.length) throw file.messages[0];
	return code.children.map(renderToken);
}

function renderToken(node: Node, key: number): ReactNode {
	if (node.type === "text") return node.value;
	if (node.type !== "element" || node.tagName !== "span") {
		throw new Error("Unexpected SDK syntax token");
	}
	const classes = node.properties.className;
	// Copy only grammar classes. Source text is always a React text node, never HTML.
	return createElement("span", {
		key,
		className: Array.isArray(classes) ? classes.map(String).join(" ") : undefined,
	}, node.children.map(renderToken));
}
