"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

type TabStep = { id: string; tab: string; icon?: React.ReactNode };

export function WorkflowTabs({ steps }: { steps: TabStep[] }) {
	const [activeId, setActiveId] = useState<string | null>(null);
	const visMap = useRef(new Map<string, boolean>());

	useEffect(() => {
		const ids = steps.map((s) => s.id);

		const observer = new IntersectionObserver(
			(entries) => {
				for (const e of entries)
					visMap.current.set(e.target.id, e.isIntersecting);
				for (const id of ids) {
					if (visMap.current.get(`workflow-${id}`)) {
						setActiveId(id);
						return;
					}
				}
			},
			{ rootMargin: "-84px 0px -50% 0px", threshold: 0 },
		);

		for (const id of ids) {
			const el = document.getElementById(`workflow-${id}`);
			if (el) observer.observe(el);
		}
		return () => observer.disconnect();
	}, [steps]);

	return (
		<div className="sticky top-[calc(3rem+1px)] z-30 ml-[calc(-50vw+50%)] w-[100vw] border-y border-[var(--ret-border)] bg-[var(--ret-bg)]/92 backdrop-blur-md">
			<nav className="mx-auto flex max-w-[var(--ret-content-max)] items-center">
				{steps.map((step) => (
					<a
						key={step.id}
						href={`#workflow-${step.id}`}
						className={cn(
							"relative flex flex-1 items-center justify-center gap-2 px-3 py-3 text-[11px] uppercase tracking-[0.14em] transition-colors",
							activeId === step.id
								? "text-[var(--ret-text)]"
								: "text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]",
						)}
					>
						{step.icon && (
							<span className="hidden shrink-0 md:block">
								{step.icon}
							</span>
						)}
						<span className="truncate">{step.tab}</span>
						<span
							className={cn(
								"absolute inset-x-0 bottom-0 h-[2px] transition-opacity",
								activeId === step.id
									? "bg-[var(--ret-purple)] opacity-100"
									: "opacity-0",
							)}
						/>
					</a>
				))}
			</nav>
		</div>
	);
}
