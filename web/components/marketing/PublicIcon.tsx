import {
	Activity,
	BarChart3,
	BookOpen,
	Bot,
	Boxes,
	Braces,
	Code2,
	Cpu,
	Database,
	FileText,
	GitBranch,
	HardDrive,
	KeyRound,
	Layers,
	LifeBuoy,
	MessageSquare,
	MousePointerClick,
	Newspaper,
	Route,
	Search,
	Server,
	ShieldCheck,
	Terminal,
	Zap,
	type LucideIcon,
} from "lucide-react";

import type { PublicIconName } from "@/lib/marketing/public-site";

const ICONS: Record<PublicIconName, LucideIcon> = {
	activity: Activity,
	"bar-chart": BarChart3,
	book: BookOpen,
	bot: Bot,
	boxes: Boxes,
	braces: Braces,
	code: Code2,
	cpu: Cpu,
	database: Database,
	file: FileText,
	"git-branch": GitBranch,
	"hard-drive": HardDrive,
	key: KeyRound,
	layers: Layers,
	"life-buoy": LifeBuoy,
	message: MessageSquare,
	mouse: MousePointerClick,
	newspaper: Newspaper,
	route: Route,
	search: Search,
	server: Server,
	shield: ShieldCheck,
	terminal: Terminal,
	zap: Zap,
};

type Props = {
	name: PublicIconName;
	className?: string;
};

export function PublicIcon({ name, className }: Props) {
	const Icon = ICONS[name];
	return <Icon className={className} aria-hidden="true" />;
}
