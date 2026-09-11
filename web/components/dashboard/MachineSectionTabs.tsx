"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, MessagesSquare, SquareTerminal, Boxes, Bot, ScrollText, History, FolderOpen } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

const GROUPS = [
	[{ path: "view", label: "Live view", icon: Activity }, { path: "console", label: "Console", icon: MessagesSquare }, { path: "terminal", label: "Terminal", icon: SquareTerminal }],
	[{ path: "loadout", label: "Loadout", icon: Boxes }, { path: "agents", label: "Runtime", icon: Bot }],
	[{ path: "logs", label: "Logs", icon: ScrollText }, { path: "sessions", label: "Sessions", icon: History }, { path: "artifacts", label: "Artifacts", icon: FolderOpen }],
];

export function MachineSectionTabs({ machineId }: { machineId: string }) {
	const pathname = usePathname();
	const base = `/dashboard/machines/${encodeURIComponent(machineId)}`;
	const group = GROUPS.find(items => items.some(item => pathname === `${base}/${item.path}`));
	if (!group) return null;
	return <nav aria-label="Workspace views" className="mx-[var(--dashboard-gutter,20px)] flex min-w-0 gap-4 overflow-x-auto border-b border-[var(--ret-border)] pt-2">
		{group.map(({ path, label, icon: Icon }) => <Link key={path} href={`${base}/${path}`} aria-current={pathname === `${base}/${path}` ? "page" : undefined} className={cn("flex min-h-11 shrink-0 items-center gap-2 border-b-2 text-sm focus-visible:outline-2", pathname === `${base}/${path}` ? "border-[var(--ret-text)]" : "border-transparent text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]")}><Icon size={16} aria-hidden="true" />{label}</Link>)}
	</nav>;
}
