"use client";

import Link from "next/link";
import { useState } from "react";
import { Bot, Brain, Boxes, ArrowRight } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

const PARTS = [
	{ id: "role", label: "Role & runtime", icon: Bot, title: "Give the agent a job.", detail: "Choose a template below, then edit its instructions and runtime. Saving a setup does not launch compute.", href: "#agent-templates", action: "Explore templates" },
	{ id: "memory", label: "Memory", icon: Brain, title: "Bring context into the work.", detail: "Create reusable memory bundles, edit their contents, and attach them to an agent setup.", href: "/dashboard/agents?tab=memory", action: "Open memory" },
	{ id: "tools", label: "Tools", icon: Boxes, title: "Add the abilities the job needs.", detail: "Review skills and integrations in Toolkit. Installation and credentials are managed on the target machine.", href: "/dashboard/registry", action: "Explore Toolkit" },
];

export function StudioBlueprint() {
	const [selected, setSelected] = useState(0);
	const part = PARTS[selected];
	return <section aria-label="Build an agent setup" className="grid overflow-hidden rounded-lg border border-[var(--ret-border)] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
		<div className="flex flex-col justify-center bg-[var(--ret-bg-soft)] p-4">
			<p className="mb-3 text-xs font-medium text-[var(--ret-text-muted)]">Inside an agent setup</p>
			<div className="flex items-center gap-2">
				{PARTS.map(({ id, label, icon: Icon }, index) => <button type="button" key={id} aria-pressed={selected === index} onClick={() => setSelected(index)} className={cn("flex min-h-20 min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-md border px-2 text-center text-sm transition-colors duration-150 focus-visible:outline-2", selected === index ? "border-[var(--ret-purple)]/50 bg-[var(--ret-purple-glow)] text-[var(--ret-text)]" : "border-[var(--ret-border)] bg-[var(--ret-bg)] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]")}><Icon size={22} aria-hidden="true" />{label}</button>)}
			</div>
		</div>
		<div className="flex min-h-44 flex-col justify-center p-5" aria-live="polite"><h2 className="text-lg font-medium">{part.title}</h2><p className="mt-2 text-sm leading-6 text-[var(--ret-text-dim)]">{part.detail}</p><Link href={part.href} className="mt-3 inline-flex min-h-8 items-center gap-2 self-start text-sm font-medium text-[var(--ret-purple)] hover:underline focus-visible:outline-2">{part.action}<ArrowRight size={16} aria-hidden="true" /></Link></div>
	</section>;
}
