"use client";

import Link from "next/link";

import { FleetCardBody } from "@/components/fleet/FleetCardBody";
import { cn } from "@/lib/cn";
import type { FleetStreamCardModel } from "@/lib/fleet/view-model";

export function FleetStreamCard({
	card,
	delaySec = 0,
	live = true,
	external = false,
}: {
	card: FleetStreamCardModel;
	delaySec?: number;
	live?: boolean;
	external?: boolean;
}) {
	const color = card.hue;
	const Wrapper = external ? "a" : Link;
	const wrapperProps = external
		? { href: card.href, target: "_blank" as const, rel: "noopener noreferrer" }
		: { href: card.href };

	return (
		<Wrapper
			{...wrapperProps}
			className={cn(
				"group flex flex-col border bg-[var(--ret-bg)] transition-[border-color] duration-200",
				card.active
					? "border-[var(--ret-purple)]/22"
					: "border-[var(--ret-border)] hover:border-[var(--ret-border-hover)]",
			)}
		>
			<FleetCardBody card={card} delaySec={delaySec} live={live} />
			<div className="flex items-center justify-end border-t border-[var(--ret-border)] px-3 py-1.5">
				<span className="text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)] opacity-0 transition-opacity group-hover:opacity-100">
					<span style={{ color }}>→</span> {external ? "docs" : "open"}
				</span>
			</div>
		</Wrapper>
	);
}
