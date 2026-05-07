"use client";

import { useMemo } from "react";
import {
	Background,
	BackgroundVariant,
	Handle,
	Position,
	ReactFlow,
	type Edge,
	type Node,
	type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";

import { Logo, type Mark } from "@/components/Logo";
import { ReticleLabel } from "@/components/reticle/ReticleLabel";

/**
 * React Flow rendition of the rig's architecture. Replaces the ASCII
 * diagram on the landing -- same information, but each node carries the
 * brand of the partner who actually owns it.
 *
 * Node positions are hand-tuned for ~1100px wide containers; the canvas
 * respects fitView so it scales gracefully on mobile. Edges use the
 * same Reticle border tokens via inline style so they pick up dark mode
 * without an extra theme bridge.
 */

type NodeData = {
	title: string;
	subtitle?: string;
	mark?: Mark;
	tone?: "default" | "purple" | "muted";
};

const NODE_TONE: Record<NonNullable<NodeData["tone"]>, string> = {
	default: "border-[var(--ret-border)] bg-[var(--ret-bg)]",
	purple:
		"border-[var(--ret-purple)]/40 bg-[var(--ret-purple-glow)] text-[var(--ret-purple)]",
	muted: "border-[var(--ret-border)] bg-[var(--ret-bg-soft)]",
};

function FlowNode({ data, sourcePosition, targetPosition }: NodeProps<NodeData>) {
	return (
		<div
			className={`min-w-[180px] rounded-[var(--ret-card-radius)] border px-4 py-3 font-mono text-[12px] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)] ${NODE_TONE[data.tone ?? "default"]}`}
		>
			<div className="flex items-center gap-2">
				{data.mark ? <Logo mark={data.mark} size={16} /> : null}
				<p className="text-[12px] font-semibold tracking-tight text-[var(--ret-text)]">
					{data.title}
				</p>
			</div>
			{data.subtitle ? (
				<p className="mt-1 text-[11px] leading-snug text-[var(--ret-text-dim)]">
					{data.subtitle}
				</p>
			) : null}
			<Handle
				type="target"
				position={targetPosition ?? Position.Top}
				style={{ background: "transparent", border: "none" }}
			/>
			<Handle
				type="source"
				position={sourcePosition ?? Position.Bottom}
				style={{ background: "transparent", border: "none" }}
			/>
		</div>
	);
}

const NODE_TYPES = { box: FlowNode };

const NODES: Node<NodeData>[] = [
	{
		id: "user",
		type: "box",
		position: { x: 460, y: 0 },
		data: {
			title: "you",
			subtitle: "@ npm run chat / browser",
			tone: "muted",
		},
	},
	{
		id: "tunnel",
		type: "box",
		position: { x: 420, y: 100 },
		data: {
			title: "public preview",
			subtitle: "cloudflared tunnel . :8642",
			mark: "dedalus",
		},
	},
	{
		id: "gateway",
		type: "box",
		position: { x: 420, y: 220 },
		data: {
			title: "Hermes gateway",
			subtitle: "OpenAI-compatible /v1",
			mark: "nous",
			tone: "purple",
		},
	},
	{
		id: "hermes",
		type: "box",
		position: { x: 200, y: 360 },
		data: {
			title: "Hermes Agent",
			subtitle: "tools, cron, skills, memory",
			mark: "nous",
		},
	},
	{
		id: "bridge",
		type: "box",
		position: { x: 660, y: 360 },
		data: {
			title: "cursor-bridge",
			subtitle: "MCP stdio . Node + @cursor/sdk",
			mark: "cursor",
		},
	},
	{
		id: "memory",
		type: "box",
		position: { x: 30, y: 500 },
		data: {
			title: "~/.hermes/",
			subtitle: "skills, cron, sessions, MEMORY.md",
			tone: "muted",
		},
	},
	{
		id: "cursor",
		type: "box",
		position: { x: 800, y: 500 },
		data: {
			title: "Cursor Agent",
			subtitle: "files, terminal, semantic search",
			mark: "cursor",
		},
	},
	{
		id: "models",
		type: "box",
		position: { x: 420, y: 620 },
		data: {
			title: "api.dedaluslabs.ai/v1",
			subtitle: "200+ models . one key",
			mark: "dedalus",
			tone: "purple",
		},
	},
];

const EDGES: Edge[] = [
	{ id: "user-tunnel", source: "user", target: "tunnel", label: "POST /chat/completions" },
	{ id: "tunnel-gateway", source: "tunnel", target: "gateway" },
	{ id: "gateway-hermes", source: "gateway", target: "hermes", label: "stream" },
	{ id: "gateway-bridge", source: "gateway", target: "bridge", label: "MCP" },
	{ id: "hermes-memory", source: "hermes", target: "memory", label: "read/write" },
	{ id: "bridge-cursor", source: "bridge", target: "cursor", label: "spawn" },
	{ id: "hermes-models", source: "hermes", target: "models", label: "inference" },
	{ id: "cursor-models", source: "cursor", target: "models", label: "inference" },
];

export function ArchitectureFlow() {
	const styledEdges = useMemo<Edge[]>(
		() =>
			EDGES.map((edge) => ({
				...edge,
				type: "smoothstep",
				animated: edge.id.includes("models"),
				style: { stroke: "var(--ret-border-strong)", strokeWidth: 1.4 },
				labelStyle: {
					fontFamily: "var(--font-mono)",
					fontSize: 10,
					fill: "var(--ret-text-muted)",
				},
				labelBgStyle: {
					fill: "var(--ret-bg)",
					fillOpacity: 0.95,
				},
				labelBgPadding: [4, 2] as [number, number],
				labelBgBorderRadius: 3,
			})),
		[],
	);

	return (
		<>
			<ReticleLabel>ARCHITECTURE</ReticleLabel>
			<h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
				One key, two endpoints, full agent
			</h2>
			<p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-[var(--ret-text-dim)] md:text-base">
				The same{" "}
				<code className="rounded border border-[var(--ret-border)] bg-[var(--ret-surface)] px-1 font-mono text-[0.85em]">
					DEDALUS_API_KEY
				</code>{" "}
				provisions the machine and authenticates inference. Each node is owned by
				one of three partners: Dedalus runs the runtime, Nous Research ships the
				agent, Cursor handles the codework.
			</p>

			<div className="relative mt-6 h-[760px] overflow-hidden rounded-[var(--ret-card-radius)] border border-[var(--ret-border)] bg-[var(--ret-bg)]">
				<ReactFlow
					nodes={NODES}
					edges={styledEdges}
					nodeTypes={NODE_TYPES}
					fitView
					fitViewOptions={{ padding: 0.18 }}
					proOptions={{ hideAttribution: true }}
					nodesDraggable={false}
					nodesConnectable={false}
					elementsSelectable={false}
					zoomOnScroll={false}
					panOnScroll={false}
					panOnDrag={false}
					zoomOnPinch={false}
					zoomOnDoubleClick={false}
				>
					<Background
						variant={BackgroundVariant.Dots}
						gap={24}
						size={1}
						color="var(--ret-grid)"
					/>
				</ReactFlow>
			</div>
		</>
	);
}
