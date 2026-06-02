"use client";

import { useEffect } from "react";

/**
 * Root error boundary. This replaces the root layout when a crash escapes
 * every nested boundary (including app/dashboard/layout.tsx), so it must ship
 * its own <html>/<body> and cannot depend on the app's CSS being loaded.
 * Styling is therefore inline and self-contained.
 */
export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error("[global] unrecovered render error:", error);
	}, [error]);

	return (
		<html lang="en">
			<body
				style={{
					margin: 0,
					minHeight: "100dvh",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					background: "#0d0d0f",
					color: "#e7e7ea",
					fontFamily:
						'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
					padding: "24px",
				}}
			>
				<div style={{ maxWidth: "480px", textAlign: "center" }}>
					<div
						style={{
							maxWidth: "340px",
							margin: "0 auto 22px",
							padding: "8px",
							border: "1px solid #2a2a30",
							background: "#0a0a0a",
						}}
					>
						{/* eslint-disable-next-line @next/next/no-img-element -- root boundary ships without app CSS/next-image */}
						<img
							src="/error-500.png"
							alt=""
							aria-hidden="true"
							style={{ display: "block", width: "100%" }}
						/>
					</div>
					<p
						style={{
							fontFamily: "ui-monospace, monospace",
							fontSize: "11px",
							letterSpacing: "0.18em",
							textTransform: "uppercase",
							color: "#8b8b93",
							margin: "0 0 12px",
						}}
					>
						agent-machines
					</p>
					<h1 style={{ fontSize: "22px", fontWeight: 600, margin: "0 0 10px" }}>
						The app hit an unexpected error
					</h1>
					<p
						style={{
							fontSize: "14px",
							lineHeight: 1.5,
							color: "#a1a1aa",
							margin: "0 0 20px",
						}}
					>
						This crash escaped every page boundary. Reloading usually clears it.
						{error.digest ? ` (ref ${error.digest})` : null}
					</p>
					<div
						style={{
							display: "flex",
							gap: "10px",
							justifyContent: "center",
							flexWrap: "wrap",
						}}
					>
						<button
							type="button"
							onClick={reset}
							style={{
								appearance: "none",
								border: "none",
								cursor: "pointer",
								padding: "9px 18px",
								fontSize: "14px",
								fontWeight: 500,
								borderRadius: 0,
								background: "#ededed",
								color: "#0d0d0f",
							}}
						>
							Try again
						</button>
						<a
							href="/dashboard"
							style={{
								padding: "9px 18px",
								fontSize: "14px",
								fontWeight: 500,
								textDecoration: "none",
								border: "1px solid #2a2a30",
								color: "#e7e7ea",
							}}
						>
							Go to dashboard
						</a>
					</div>
				</div>
			</body>
		</html>
	);
}
