import { ImageResponse } from "next/og";

import { HARNESS_COUNTS } from "@/lib/platform/harness-counts";

/**
 * Dynamic OG image rendered with `next/og` -- evaluated at build time
 * (or on first hit) and served from `/opengraph-image`. The `metadata`
 * object below registers it as the default OpenGraph + Twitter image
 * for `/`, so any link to `https://www.agent-machines.dev/` previews
 * with this card.
 *
 * Layout: Reticle dark background, hairline borders, kicker label,
 * tagline H1, three feature pills along the bottom, brand wordmark
 * top-right. Pure inline styles -- next/og's renderer is a constrained
 * Satori subset, no Tailwind, no external SVG.
 */

export const runtime = "edge";
export const alt =
	"Agent Machines switchboard for persistent agent workers, sandboxes, model paths, loadouts, logs, usage, cron, and artifacts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COLOR = {
	bg: "#09090b",
	bgSoft: "#111113",
	text: "rgba(255,255,255,0.92)",
	textDim: "rgba(255,255,255,0.55)",
	textMuted: "rgba(255,255,255,0.32)",
	border: "rgba(255,255,255,0.18)",
	purple: "#d2beff",
	purpleGlow: "rgba(210,190,255,0.10)",
	amber: "#fbbf24",
};

export default async function OpengraphImage() {
	return new ImageResponse(
		(
			<div
				style={{
					width: "100%",
					height: "100%",
					background: COLOR.bg,
					color: COLOR.text,
					fontFamily: "Geist, system-ui, sans-serif",
					display: "flex",
					flexDirection: "column",
					padding: 64,
					position: "relative",
				}}
			>
				{/* Hairline frame */}
				<div
					style={{
						position: "absolute",
						inset: 24,
						border: `1px solid ${COLOR.border}`,
					}}
				/>
				{/* Kicker */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 14,
						fontFamily: "Geist Mono, monospace",
						fontSize: 18,
						letterSpacing: 4,
						color: COLOR.textMuted,
						textTransform: "uppercase",
					}}
				>
					<span style={{ color: COLOR.purple }}>{"//"}</span>
					<span>AGENT MACHINES</span>
					<span
						style={{
							border: `1px solid ${COLOR.border}`,
							padding: "2px 10px",
							color: COLOR.purple,
							background: COLOR.purpleGlow,
						}}
					>
						agents + sandboxes
					</span>
					<span
						style={{
							border: `1px solid ${COLOR.border}`,
							padding: "2px 10px",
							color: COLOR.textDim,
						}}
					>
						worker control plane
					</span>
				</div>

				{/* Headline */}
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						marginTop: 48,
						fontWeight: 600,
						lineHeight: 1.05,
						letterSpacing: -1.5,
					}}
				>
					<span style={{ fontSize: 72, color: COLOR.text }}>
						Persistent workers
					</span>
					<span style={{ fontSize: 72, color: COLOR.textDim }}>
						any runtime, any sandbox.
					</span>
				</div>

				{/* Sub-line */}
				<div
					style={{
						marginTop: 28,
						fontSize: 26,
						color: COLOR.textDim,
						lineHeight: 1.35,
						maxWidth: 980,
					}}
				>
					Pair agent runtime, sandbox lane, model path, loadout, logs,
					usage, cron, and artifacts from one account.
				</div>

				{/* Feature strip */}
				<div
					style={{
						display: "flex",
						gap: 12,
						marginTop: "auto",
						fontFamily: "Geist Mono, monospace",
						fontSize: 18,
						color: COLOR.textDim,
					}}
				>
					{[
						{ label: `${HARNESS_COUNTS.skillCount} skills` },
						{ label: `${HARNESS_COUNTS.serviceRouteCount} service lanes` },
						{ label: `${HARNESS_COUNTS.cliCount}+ CLIs` },
						{ label: `${HARNESS_COUNTS.mcpServerCount} MCP servers` },
						{ label: "runtime + sandbox + model" },
					].map((f) => (
						<div
							key={f.label}
							style={{
								border: `1px solid ${COLOR.border}`,
								padding: "10px 14px",
								background: COLOR.bgSoft,
								letterSpacing: 1.5,
								textTransform: "uppercase",
							}}
						>
							{f.label}
						</div>
					))}
				</div>

				{/* Wordmark top-right */}
				<div
					style={{
						position: "absolute",
						top: 56,
						right: 64,
						fontFamily: "Geist Mono, monospace",
						fontSize: 16,
						color: COLOR.textMuted,
						letterSpacing: 2.5,
						textTransform: "uppercase",
					}}
				>
					agent-machines.dev
				</div>
			</div>
		),
		{ ...size },
	);
}
