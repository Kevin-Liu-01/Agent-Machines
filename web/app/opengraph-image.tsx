import { ImageResponse } from "next/og";

import {
	NACELLE_REGULAR_BASE64,
	NACELLE_SEMIBOLD_BASE64,
} from "@/lib/seo/opengraph-fonts";

export const runtime = "edge";
export const alt =
	"Agent Machines routes an agent runtime, sandbox, and model path into one persistent worker";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COLOR = {
	background: "#fbfbfb",
	ink: "#18181b",
	muted: "#52525b",
	hairline: "#c7c7ca",
	accent: "#71717a",
	brand: "#9b98a8",
	panel: "#09090b",
	panelMuted: "#a1a1aa",
	white: "#ffffff",
} as const;

function decodeFont(encoded: string): ArrayBuffer {
	const binary = atob(encoded);
	const bytes = new Uint8Array(binary.length);

	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}

	return bytes.buffer;
}

const nacelleRegular = decodeFont(NACELLE_REGULAR_BASE64);
const nacelleSemibold = decodeFont(NACELLE_SEMIBOLD_BASE64);

function Mark({ markSize = 44 }: { markSize?: number }) {
	return (
		<svg height={markSize} viewBox="0 0 32 32" width={markSize}>
			<path
				fill={COLOR.brand}
				d="M10 4h12v6H10V4ZM4 10h6v12H4V10ZM22 10h6v12h-6V10ZM10 22h12v6H10V22Z"
			/>
			<path fill={COLOR.white} d="M10 10h6v6h-6v-6ZM16 16h6v6h-6v-6Z" />
			<path
				fill={COLOR.ink}
				d="M23 5h4v4h-4V5ZM16 10h6v6h-6v-6ZM10 16h6v6h-6v-6ZM5 23h4v4H5v-4Z"
			/>
		</svg>
	);
}

function Input({
	label,
	value,
}: {
	label: string;
	value: string;
}) {
	return (
		<div
			style={{
				background: COLOR.background,
				border: `1px solid ${COLOR.hairline}`,
				display: "flex",
				flexDirection: "column",
				height: 60,
				justifyContent: "center",
				padding: "0 18px",
				width: 350,
			}}
		>
			<div
				style={{
					color: COLOR.muted,
					display: "flex",
					fontSize: 11,
					fontWeight: 600,
					letterSpacing: 1.6,
					textTransform: "uppercase",
				}}
			>
				{label}
			</div>
			<div
				style={{
					color: COLOR.ink,
					display: "flex",
					fontSize: 16,
					marginTop: 4,
				}}
			>
				{value}
			</div>
		</div>
	);
}

function RoutingDiagram() {
	return (
		<div
			style={{
				display: "flex",
				height: 226,
				position: "relative",
				width: 1088,
			}}
		>
			<svg
				height="226"
				style={{ left: 0, position: "absolute", top: 0 }}
				viewBox="0 0 1088 226"
				width="1088"
			>
				<path
					d="M350 30H367L450 113H500M350 113H500M350 196H367L450 113"
					fill="none"
					stroke={COLOR.accent}
					strokeLinecap="square"
					strokeLinejoin="miter"
					strokeWidth="1.75"
				/>
				<rect
					x="445"
					y="108"
					width="10"
					height="10"
					fill={COLOR.background}
					stroke={COLOR.accent}
					transform="rotate(45 450 113)"
				/>
				<path
					d="M489 107L500 113L489 119"
					fill="none"
					stroke={COLOR.accent}
					strokeLinecap="square"
					strokeLinejoin="miter"
					strokeWidth="1.75"
				/>
			</svg>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 23,
					left: 0,
					position: "absolute",
					top: 0,
				}}
			>
				<Input label="Runtime" value="Hermes · OpenClaw · Claude · Codex" />
				<Input label="Sandbox" value="E2B · Sprites · Dedalus · Vercel" />
				<Input label="Model route" value="Gateway · OpenRouter · Native" />
			</div>

			<div
				style={{
					alignItems: "center",
					background: COLOR.panel,
					color: COLOR.white,
					display: "flex",
					height: 226,
					justifyContent: "space-between",
					left: 500,
					padding: "0 38px",
					position: "absolute",
					top: 0,
					width: 588,
				}}
			>
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div
						style={{
							display: "flex",
							fontSize: 30,
							fontWeight: 600,
							letterSpacing: -0.7,
						}}
					>
						Persistent worker
					</div>
					<div
						style={{
							color: COLOR.panelMuted,
							display: "flex",
							fontSize: 16,
							marginTop: 10,
						}}
					>
						Memory · tools · cron · logs
					</div>
				</div>
				<Mark markSize={68} />
			</div>
		</div>
	);
}

export default function OpengraphImage() {
	return new ImageResponse(
		<div
			style={{
				background: COLOR.background,
				color: COLOR.ink,
				display: "flex",
				fontFamily: "Nacelle",
				height: "100%",
				position: "relative",
				width: "100%",
			}}
		>
			<div
				style={{
					alignItems: "center",
					display: "flex",
					left: 56,
					position: "absolute",
					top: 42,
				}}
			>
				<Mark />
				<div
					style={{
						display: "flex",
						fontSize: 19,
						fontWeight: 600,
						letterSpacing: -0.2,
						marginLeft: 14,
					}}
				>
					agent-machines
				</div>
			</div>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					left: 56,
					position: "absolute",
					top: 113,
				}}
			>
				<div
					style={{
						display: "flex",
						fontSize: 57,
						fontWeight: 600,
						letterSpacing: -2.5,
						lineHeight: 1,
					}}
				>
					OpenRouter for agents and containers.
				</div>
				<div
					style={{
						color: COLOR.muted,
						display: "flex",
						fontSize: 21,
						letterSpacing: -0.2,
						marginTop: 19,
					}}
				>
					Route any runtime, sandbox, and model path into one persistent worker.
				</div>
			</div>

			<div style={{ bottom: 36, display: "flex", left: 56, position: "absolute" }}>
				<RoutingDiagram />
			</div>
		</div>,
		{
			...size,
			fonts: [
				{
					name: "Nacelle",
					data: nacelleRegular,
					style: "normal",
					weight: 400,
				},
				{
					name: "Nacelle",
					data: nacelleSemibold,
					style: "normal",
					weight: 600,
				},
			],
		},
	);
}
