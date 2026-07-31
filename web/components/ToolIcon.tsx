import {
	BookOpen,
	Bot,
	Clock,
	Code2,
	Eye,
	Folder,
	GitFork,
	Globe2,
	Image as ImageIcon,
	ListChecks,
	MemoryStick,
	Search,
	Server,
	Terminal,
	Volume2,
	type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/cn";
import type { ToolCategory } from "@/lib/dashboard/loadout";

/**
 * Functional category icon used when a tool has no third-party brand.
 * Generic actions come from the same Lucide family used across the rest
 * of the interface; branded tools continue to use ServiceIcon.
 */

const ICONS: Record<
	ToolCategory | "task" | "skill" | "subagent" | "rig",
	LucideIcon
> = {
	shell: Terminal,
	filesystem: Folder,
	browser: Globe2,
	vision: Eye,
	code: Code2,
	memory: MemoryStick,
	schedule: Clock,
	search: Search,
	audio: Volume2,
	image: ImageIcon,
	delegate: GitFork,
	task: ListChecks,
	skill: BookOpen,
	subagent: Bot,
	rig: Server,
};

type Props = {
	name: keyof typeof ICONS;
	size?: number;
	className?: string;
};

export function ToolIcon({ name, size = 14, className }: Props) {
	const Icon = ICONS[name];
	return (
		<Icon
			width={size}
			height={size}
			strokeWidth={1.75}
			className={cn("inline-block shrink-0", className)}
			aria-hidden="true"
		/>
	);
}
