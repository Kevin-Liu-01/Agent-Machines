import Link from "next/link";
import { Bot, Brain, Store, Sparkles, Plug2, BarChart3, Gauge, Boxes, type LucideIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

const ICONS: Record<string, LucideIcon> = { setups: Bot, memory: Brain, catalog: Store, skills: Sparkles, mcps: Plug2, loadout: Boxes, usage: BarChart3, benchmarks: Gauge };

/** URL-backed workspace sections: shareable, keyboard-native, and safe to revisit. */
export function WorkspaceTabs({ label, active, items }: {
	label: string;
	active: string;
	items: ReadonlyArray<{ id: string; label: string; href: string }>;
}) {
	return <nav aria-label={label} className="mx-[var(--dashboard-gutter,20px)] mt-4 flex min-w-0 gap-1 overflow-x-auto border-b border-[var(--ret-border)]">
		{items.map(item => {
			const Icon = ICONS[item.id] ?? Boxes;
			return <Link key={item.id} href={item.href} aria-current={active === item.id ? "page" : undefined}
				className={cn("flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px]", active === item.id ? "border-[var(--ret-text)] text-[var(--ret-text)]" : "border-transparent text-[var(--ret-text-muted)] hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)]")}>
				<Icon size={16} aria-hidden="true" />{item.label}
			</Link>;
		})}
	</nav>;
}

export const STUDIO_TABS = [
	{ id: "setups", label: "Agent setups", href: "/dashboard/agents" },
	{ id: "memory", label: "Memory", href: "/dashboard/agents?tab=memory" },
];
export const TOOLKIT_TABS = [
	{ id: "catalog", label: "Discover", href: "/dashboard/registry" },
	{ id: "skills", label: "Your skills", href: "/dashboard/registry?tab=skills" },
	{ id: "mcps", label: "MCP servers", href: "/dashboard/registry?tab=mcps" },
	{ id: "loadout", label: "Machine loadout", href: "/dashboard/loadout" },
];
export const INSIGHT_TABS = [
	{ id: "usage", label: "Usage & costs", href: "/dashboard/usage" },
	{ id: "benchmarks", label: "Benchmarks", href: "/dashboard/usage?tab=benchmarks" },
];
