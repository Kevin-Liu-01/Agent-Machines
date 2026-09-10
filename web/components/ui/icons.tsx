import { createElement, forwardRef, type ForwardRefExoticComponent, type RefAttributes } from "react";
import type { Icon as PhosphorIcon, IconProps as PhosphorIconProps } from "@phosphor-icons/react/dist/lib/types";
import { ArrowClockwiseIcon as PhosphorArrowClockwise } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { ArrowLeftIcon as PhosphorArrowLeft } from "@phosphor-icons/react/dist/ssr/ArrowLeft";
import { ArrowRightIcon as PhosphorArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { ArrowSquareOutIcon as PhosphorArrowSquareOut } from "@phosphor-icons/react/dist/ssr/ArrowSquareOut";
import { ArrowUpRightIcon as PhosphorArrowUpRight } from "@phosphor-icons/react/dist/ssr/ArrowUpRight";
import { ArrowsCounterClockwiseIcon as PhosphorArrowsCounterClockwise } from "@phosphor-icons/react/dist/ssr/ArrowsCounterClockwise";
import { ArrowsOutIcon as PhosphorArrowsOut } from "@phosphor-icons/react/dist/ssr/ArrowsOut";
import { BookOpenIcon as PhosphorBookOpen } from "@phosphor-icons/react/dist/ssr/BookOpen";
import { BookOpenTextIcon as PhosphorBookOpenText } from "@phosphor-icons/react/dist/ssr/BookOpenText";
import { BoxArrowUpIcon as PhosphorBoxArrowUp } from "@phosphor-icons/react/dist/ssr/BoxArrowUp";
import { BracketsCurlyIcon as PhosphorBracketsCurly } from "@phosphor-icons/react/dist/ssr/BracketsCurly";
import { BrainIcon as PhosphorBrain } from "@phosphor-icons/react/dist/ssr/Brain";
import { BriefcaseIcon as PhosphorBriefcase } from "@phosphor-icons/react/dist/ssr/Briefcase";
import { BroadcastIcon as PhosphorBroadcast } from "@phosphor-icons/react/dist/ssr/Broadcast";
import { CalendarDotsIcon as PhosphorCalendarDots } from "@phosphor-icons/react/dist/ssr/CalendarDots";
import { CaretDownIcon as PhosphorCaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { CaretLeftIcon as PhosphorCaretLeft } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { CaretRightIcon as PhosphorCaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { ChartBarIcon as PhosphorChartBar } from "@phosphor-icons/react/dist/ssr/ChartBar";
import { ChatIcon as PhosphorChat } from "@phosphor-icons/react/dist/ssr/Chat";
import { ChatsIcon as PhosphorChats } from "@phosphor-icons/react/dist/ssr/Chats";
import { CheckIcon as PhosphorCheck } from "@phosphor-icons/react/dist/ssr/Check";
import { CheckCircleIcon as PhosphorCheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { CircleIcon as PhosphorCircle } from "@phosphor-icons/react/dist/ssr/Circle";
import { CircleDashedIcon as PhosphorCircleDashed } from "@phosphor-icons/react/dist/ssr/CircleDashed";
import { ClipboardIcon as PhosphorClipboard } from "@phosphor-icons/react/dist/ssr/Clipboard";
import { ClipboardTextIcon as PhosphorClipboardText } from "@phosphor-icons/react/dist/ssr/ClipboardText";
import { ClockIcon as PhosphorClock } from "@phosphor-icons/react/dist/ssr/Clock";
import { ClockCounterClockwiseIcon as PhosphorClockCounterClockwise } from "@phosphor-icons/react/dist/ssr/ClockCounterClockwise";
import { CloudIcon as PhosphorCloud } from "@phosphor-icons/react/dist/ssr/Cloud";
import { CloudArrowUpIcon as PhosphorCloudArrowUp } from "@phosphor-icons/react/dist/ssr/CloudArrowUp";
import { CloudSlashIcon as PhosphorCloudSlash } from "@phosphor-icons/react/dist/ssr/CloudSlash";
import { CodeIcon as PhosphorCode } from "@phosphor-icons/react/dist/ssr/Code";
import { CopyIcon as PhosphorCopy } from "@phosphor-icons/react/dist/ssr/Copy";
import { CpuIcon as PhosphorCpu } from "@phosphor-icons/react/dist/ssr/Cpu";
import { CubeIcon as PhosphorCube } from "@phosphor-icons/react/dist/ssr/Cube";
import { CubeTransparentIcon as PhosphorCubeTransparent } from "@phosphor-icons/react/dist/ssr/CubeTransparent";
import { CursorClickIcon as PhosphorCursorClick } from "@phosphor-icons/react/dist/ssr/CursorClick";
import { DatabaseIcon as PhosphorDatabase } from "@phosphor-icons/react/dist/ssr/Database";
import { DownloadSimpleIcon as PhosphorDownloadSimple } from "@phosphor-icons/react/dist/ssr/DownloadSimple";
import { EyeIcon as PhosphorEye } from "@phosphor-icons/react/dist/ssr/Eye";
import { FileArrowUpIcon as PhosphorFileArrowUp } from "@phosphor-icons/react/dist/ssr/FileArrowUp";
import { FileCodeIcon as PhosphorFileCode } from "@phosphor-icons/react/dist/ssr/FileCode";
import { FileTextIcon as PhosphorFileText } from "@phosphor-icons/react/dist/ssr/FileText";
import { FingerprintIcon as PhosphorFingerprint } from "@phosphor-icons/react/dist/ssr/Fingerprint";
import { FlowArrowIcon as PhosphorFlowArrow } from "@phosphor-icons/react/dist/ssr/FlowArrow";
import { FolderIcon as PhosphorFolder } from "@phosphor-icons/react/dist/ssr/Folder";
import { FolderOpenIcon as PhosphorFolderOpen } from "@phosphor-icons/react/dist/ssr/FolderOpen";
import { FolderSimpleIcon as PhosphorFolderSimple } from "@phosphor-icons/react/dist/ssr/FolderSimple";
import { FoldersIcon as PhosphorFolders } from "@phosphor-icons/react/dist/ssr/Folders";
import { GaugeIcon as PhosphorGauge } from "@phosphor-icons/react/dist/ssr/Gauge";
import { GearIcon as PhosphorGear } from "@phosphor-icons/react/dist/ssr/Gear";
import { GitBranchIcon as PhosphorGitBranch } from "@phosphor-icons/react/dist/ssr/GitBranch";
import { GitDiffIcon as PhosphorGitDiff } from "@phosphor-icons/react/dist/ssr/GitDiff";
import { GitForkIcon as PhosphorGitFork } from "@phosphor-icons/react/dist/ssr/GitFork";
import { GlobeIcon as PhosphorGlobe } from "@phosphor-icons/react/dist/ssr/Globe";
import { GraphIcon as PhosphorGraph } from "@phosphor-icons/react/dist/ssr/Graph";
import { HardDriveIcon as PhosphorHardDrive } from "@phosphor-icons/react/dist/ssr/HardDrive";
import { HardDrivesIcon as PhosphorHardDrives } from "@phosphor-icons/react/dist/ssr/HardDrives";
import { HashIcon as PhosphorHash } from "@phosphor-icons/react/dist/ssr/Hash";
import { ImageIcon as PhosphorImage } from "@phosphor-icons/react/dist/ssr/Image";
import { KeyIcon as PhosphorKey } from "@phosphor-icons/react/dist/ssr/Key";
import { LifebuoyIcon as PhosphorLifebuoy } from "@phosphor-icons/react/dist/ssr/Lifebuoy";
import { LightningIcon as PhosphorLightning } from "@phosphor-icons/react/dist/ssr/Lightning";
import { ListChecksIcon as PhosphorListChecks } from "@phosphor-icons/react/dist/ssr/ListChecks";
import { LockKeyIcon as PhosphorLockKey } from "@phosphor-icons/react/dist/ssr/LockKey";
import { MagnifyingGlassIcon as PhosphorMagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { MemoryIcon as PhosphorMemory } from "@phosphor-icons/react/dist/ssr/Memory";
import { MonitorIcon as PhosphorMonitor } from "@phosphor-icons/react/dist/ssr/Monitor";
import { MoonIcon as PhosphorMoon } from "@phosphor-icons/react/dist/ssr/Moon";
import { NewspaperIcon as PhosphorNewspaper } from "@phosphor-icons/react/dist/ssr/Newspaper";
import { NotePencilIcon as PhosphorNotePencil } from "@phosphor-icons/react/dist/ssr/NotePencil";
import { PackageIcon as PhosphorPackage } from "@phosphor-icons/react/dist/ssr/Package";
import { PathIcon as PhosphorPath } from "@phosphor-icons/react/dist/ssr/Path";
import { PencilSimpleIcon as PhosphorPencilSimple } from "@phosphor-icons/react/dist/ssr/PencilSimple";
import { PlayIcon as PhosphorPlay } from "@phosphor-icons/react/dist/ssr/Play";
import { PlugIcon as PhosphorPlug } from "@phosphor-icons/react/dist/ssr/Plug";
import { PlugsIcon as PhosphorPlugs } from "@phosphor-icons/react/dist/ssr/Plugs";
import { PlugsConnectedIcon as PhosphorPlugsConnected } from "@phosphor-icons/react/dist/ssr/PlugsConnected";
import { PlusIcon as PhosphorPlus } from "@phosphor-icons/react/dist/ssr/Plus";
import { PowerIcon as PhosphorPower } from "@phosphor-icons/react/dist/ssr/Power";
import { PulseIcon as PhosphorPulse } from "@phosphor-icons/react/dist/ssr/Pulse";
import { RecordIcon as PhosphorRecord } from "@phosphor-icons/react/dist/ssr/Record";
import { RobotIcon as PhosphorRobot } from "@phosphor-icons/react/dist/ssr/Robot";
import { RocketLaunchIcon as PhosphorRocketLaunch } from "@phosphor-icons/react/dist/ssr/RocketLaunch";
import { ScrollIcon as PhosphorScroll } from "@phosphor-icons/react/dist/ssr/Scroll";
import { ShieldIcon as PhosphorShield } from "@phosphor-icons/react/dist/ssr/Shield";
import { ShieldCheckIcon as PhosphorShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { ShieldWarningIcon as PhosphorShieldWarning } from "@phosphor-icons/react/dist/ssr/ShieldWarning";
import { SlidersHorizontalIcon as PhosphorSlidersHorizontal } from "@phosphor-icons/react/dist/ssr/SlidersHorizontal";
import { SparkleIcon as PhosphorSparkle } from "@phosphor-icons/react/dist/ssr/Sparkle";
import { SpeakerHighIcon as PhosphorSpeakerHigh } from "@phosphor-icons/react/dist/ssr/SpeakerHigh";
import { SpinnerGapIcon as PhosphorSpinnerGap } from "@phosphor-icons/react/dist/ssr/SpinnerGap";
import { SquaresFourIcon as PhosphorSquaresFour } from "@phosphor-icons/react/dist/ssr/SquaresFour";
import { StackIcon as PhosphorStack } from "@phosphor-icons/react/dist/ssr/Stack";
import { StorefrontIcon as PhosphorStorefront } from "@phosphor-icons/react/dist/ssr/Storefront";
import { SunIcon as PhosphorSun } from "@phosphor-icons/react/dist/ssr/Sun";
import { TerminalWindowIcon as PhosphorTerminalWindow } from "@phosphor-icons/react/dist/ssr/TerminalWindow";
import { TrashIcon as PhosphorTrash } from "@phosphor-icons/react/dist/ssr/Trash";
import { UserIcon as PhosphorUser } from "@phosphor-icons/react/dist/ssr/User";
import { UsersIcon as PhosphorUsers } from "@phosphor-icons/react/dist/ssr/Users";
import { WarningIcon as PhosphorWarning } from "@phosphor-icons/react/dist/ssr/Warning";
import { WarningCircleIcon as PhosphorWarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { WifiHighIcon as PhosphorWifiHigh } from "@phosphor-icons/react/dist/ssr/WifiHigh";
import { WrenchIcon as PhosphorWrench } from "@phosphor-icons/react/dist/ssr/Wrench";
import { XIcon as PhosphorX } from "@phosphor-icons/react/dist/ssr/X";

/**
 * Shared, genuinely filled interface icons. Brand marks remain in Logo/ServiceIcon.
 * Individual SSR imports avoid the package-wide icon barrel and work in both
 * server-rendered marketing pages and interactive client components.
 *
 * Legacy Lucide names/props keep existing consumers source-compatible during
 * migration. Stroke/fill overrides are intentionally ignored: Phosphor's fill
 * weight supplies the silhouette; CSS-filling an outline is not equivalent.
 */
export type IconProps = Omit<PhosphorIconProps, "weight"> & {
	absoluteStrokeWidth?: boolean;
};
export type IconComponent = ForwardRefExoticComponent<Omit<IconProps, "ref"> & RefAttributes<SVGSVGElement>>;
/** @deprecated Prefer IconComponent in new code. */
export type LucideIcon = IconComponent;

function filledIcon(name: string, Component: PhosphorIcon): IconComponent {
	const Icon = forwardRef<SVGSVGElement, IconProps>(function FilledIcon({
		size = 24,
		strokeWidth: _strokeWidth,
		absoluteStrokeWidth: _absoluteStrokeWidth,
		stroke: _stroke,
		fill: _fill,
		...props
	}, ref) {
		const hasName = Boolean(props["aria-label"] || props["aria-labelledby"] || props.alt);
		const iconProps = {
			"aria-hidden": hasName ? undefined : true,
			focusable: false,
			...props,
			ref,
			size,
			weight: "fill" as const,
			stroke: "none",
			"data-icon-family": "phosphor",
			"data-icon-weight": "fill",
		};
		return createElement(Component, iconProps);
	});
	Icon.displayName = name;
	return Icon;
}

export const Activity = /* @__PURE__ */ filledIcon("Activity", PhosphorPulse);
export const AlertCircle = /* @__PURE__ */ filledIcon("AlertCircle", PhosphorWarningCircle);
export const ArrowLeft = /* @__PURE__ */ filledIcon("ArrowLeft", PhosphorArrowLeft);
export const ArrowRight = /* @__PURE__ */ filledIcon("ArrowRight", PhosphorArrowRight);
export const ArrowUpRight = /* @__PURE__ */ filledIcon("ArrowUpRight", PhosphorArrowUpRight);
export const BarChart3 = /* @__PURE__ */ filledIcon("BarChart3", PhosphorChartBar);
export const BookOpen = /* @__PURE__ */ filledIcon("BookOpen", PhosphorBookOpen);
export const BookOpenCheck = /* @__PURE__ */ filledIcon("BookOpenCheck", PhosphorBookOpenText);
export const Bot = /* @__PURE__ */ filledIcon("Bot", PhosphorRobot);
export const Box = /* @__PURE__ */ filledIcon("Box", PhosphorCube);
export const Boxes = /* @__PURE__ */ filledIcon("Boxes", PhosphorCubeTransparent);
export const Braces = /* @__PURE__ */ filledIcon("Braces", PhosphorBracketsCurly);
export const Brain = /* @__PURE__ */ filledIcon("Brain", PhosphorBrain);
export const BrainCircuit = /* @__PURE__ */ filledIcon("BrainCircuit", PhosphorBrain);
export const BriefcaseBusiness = /* @__PURE__ */ filledIcon("BriefcaseBusiness", PhosphorBriefcase);
export const Cable = /* @__PURE__ */ filledIcon("Cable", PhosphorPlugsConnected);
export const CalendarDays = /* @__PURE__ */ filledIcon("CalendarDays", PhosphorCalendarDots);
export const Check = /* @__PURE__ */ filledIcon("Check", PhosphorCheck);
export const CheckCircle2 = /* @__PURE__ */ filledIcon("CheckCircle2", PhosphorCheckCircle);
export const ChevronDown = /* @__PURE__ */ filledIcon("ChevronDown", PhosphorCaretDown);
export const ChevronLeft = /* @__PURE__ */ filledIcon("ChevronLeft", PhosphorCaretLeft);
export const ChevronRight = /* @__PURE__ */ filledIcon("ChevronRight", PhosphorCaretRight);
export const Circle = /* @__PURE__ */ filledIcon("Circle", PhosphorCircle);
export const CircleDashed = /* @__PURE__ */ filledIcon("CircleDashed", PhosphorCircleDashed);
export const CircleDot = /* @__PURE__ */ filledIcon("CircleDot", PhosphorRecord);
export const Clipboard = /* @__PURE__ */ filledIcon("Clipboard", PhosphorClipboard);
export const Clock = /* @__PURE__ */ filledIcon("Clock", PhosphorClock);
export const Clock3 = /* @__PURE__ */ filledIcon("Clock3", PhosphorClock);
export const Cloud = /* @__PURE__ */ filledIcon("Cloud", PhosphorCloud);
export const CloudCog = /* @__PURE__ */ filledIcon("CloudCog", PhosphorCloudArrowUp);
export const Code2 = /* @__PURE__ */ filledIcon("Code2", PhosphorCode);
export const Cog = /* @__PURE__ */ filledIcon("Cog", PhosphorGear);
export const Copy = /* @__PURE__ */ filledIcon("Copy", PhosphorCopy);
export const Cpu = /* @__PURE__ */ filledIcon("Cpu", PhosphorCpu);
export const Database = /* @__PURE__ */ filledIcon("Database", PhosphorDatabase);
export const Download = /* @__PURE__ */ filledIcon("Download", PhosphorDownloadSimple);
export const Expand = /* @__PURE__ */ filledIcon("Expand", PhosphorArrowsOut);
export const ExternalLink = /* @__PURE__ */ filledIcon("ExternalLink", PhosphorArrowSquareOut);
export const Eye = /* @__PURE__ */ filledIcon("Eye", PhosphorEye);
export const FileCheck2 = /* @__PURE__ */ filledIcon("FileCheck2", PhosphorClipboardText);
export const FileCode2 = /* @__PURE__ */ filledIcon("FileCode2", PhosphorFileCode);
export const FileDiff = /* @__PURE__ */ filledIcon("FileDiff", PhosphorGitDiff);
export const FileOutput = /* @__PURE__ */ filledIcon("FileOutput", PhosphorFileArrowUp);
export const FilePenLine = /* @__PURE__ */ filledIcon("FilePenLine", PhosphorNotePencil);
export const FileText = /* @__PURE__ */ filledIcon("FileText", PhosphorFileText);
export const Fingerprint = /* @__PURE__ */ filledIcon("Fingerprint", PhosphorFingerprint);
export const Folder = /* @__PURE__ */ filledIcon("Folder", PhosphorFolder);
export const FolderOpen = /* @__PURE__ */ filledIcon("FolderOpen", PhosphorFolderOpen);
export const FolderKanban = /* @__PURE__ */ filledIcon("FolderKanban", PhosphorFolderSimple);
export const FolderTree = /* @__PURE__ */ filledIcon("FolderTree", PhosphorFolders);
export const Gauge = /* @__PURE__ */ filledIcon("Gauge", PhosphorGauge);
export const GitBranch = /* @__PURE__ */ filledIcon("GitBranch", PhosphorGitBranch);
export const GitFork = /* @__PURE__ */ filledIcon("GitFork", PhosphorGitFork);
export const Globe = /* @__PURE__ */ filledIcon("Globe", PhosphorGlobe);
export const Globe2 = /* @__PURE__ */ filledIcon("Globe2", PhosphorGlobe);
export const HardDrive = /* @__PURE__ */ filledIcon("HardDrive", PhosphorHardDrive);
export const HardDriveDownload = /* @__PURE__ */ filledIcon("HardDriveDownload", PhosphorHardDrive);
export const Hash = /* @__PURE__ */ filledIcon("Hash", PhosphorHash);
export const History = /* @__PURE__ */ filledIcon("History", PhosphorClockCounterClockwise);
export const Image = /* @__PURE__ */ filledIcon("Image", PhosphorImage);
export const KeyRound = /* @__PURE__ */ filledIcon("KeyRound", PhosphorKey);
export const Layers = /* @__PURE__ */ filledIcon("Layers", PhosphorStack);
export const Layers3 = /* @__PURE__ */ filledIcon("Layers3", PhosphorStack);
export const LayoutDashboard = /* @__PURE__ */ filledIcon("LayoutDashboard", PhosphorSquaresFour);
export const LayoutGrid = /* @__PURE__ */ filledIcon("LayoutGrid", PhosphorSquaresFour);
export const LifeBuoy = /* @__PURE__ */ filledIcon("LifeBuoy", PhosphorLifebuoy);
export const ListChecks = /* @__PURE__ */ filledIcon("ListChecks", PhosphorListChecks);
export const LoaderCircle = /* @__PURE__ */ filledIcon("LoaderCircle", PhosphorSpinnerGap);
export const LockKeyhole = /* @__PURE__ */ filledIcon("LockKeyhole", PhosphorLockKey);
export const MemoryStick = /* @__PURE__ */ filledIcon("MemoryStick", PhosphorMemory);
export const MessageSquare = /* @__PURE__ */ filledIcon("MessageSquare", PhosphorChat);
export const MessagesSquare = /* @__PURE__ */ filledIcon("MessagesSquare", PhosphorChats);
export const Monitor = /* @__PURE__ */ filledIcon("Monitor", PhosphorMonitor);
export const Moon = /* @__PURE__ */ filledIcon("Moon", PhosphorMoon);
export const MousePointerClick = /* @__PURE__ */ filledIcon("MousePointerClick", PhosphorCursorClick);
export const Network = /* @__PURE__ */ filledIcon("Network", PhosphorGraph);
export const Newspaper = /* @__PURE__ */ filledIcon("Newspaper", PhosphorNewspaper);
export const Package = /* @__PURE__ */ filledIcon("Package", PhosphorPackage);
export const PackageOpen = /* @__PURE__ */ filledIcon("PackageOpen", PhosphorBoxArrowUp);
export const Pencil = /* @__PURE__ */ filledIcon("Pencil", PhosphorPencilSimple);
export const Play = /* @__PURE__ */ filledIcon("Play", PhosphorPlay);
export const Plug = /* @__PURE__ */ filledIcon("Plug", PhosphorPlug);
export const Plug2 = /* @__PURE__ */ filledIcon("Plug2", PhosphorPlugs);
export const PlugZap = /* @__PURE__ */ filledIcon("PlugZap", PhosphorLightning);
export const Plus = /* @__PURE__ */ filledIcon("Plus", PhosphorPlus);
export const Power = /* @__PURE__ */ filledIcon("Power", PhosphorPower);
export const Radio = /* @__PURE__ */ filledIcon("Radio", PhosphorBroadcast);
export const RefreshCcw = /* @__PURE__ */ filledIcon("RefreshCcw", PhosphorArrowsCounterClockwise);
export const Rocket = /* @__PURE__ */ filledIcon("Rocket", PhosphorRocketLaunch);
export const RotateCw = /* @__PURE__ */ filledIcon("RotateCw", PhosphorArrowClockwise);
export const Route = /* @__PURE__ */ filledIcon("Route", PhosphorPath);
export const ScrollText = /* @__PURE__ */ filledIcon("ScrollText", PhosphorScroll);
export const Search = /* @__PURE__ */ filledIcon("Search", PhosphorMagnifyingGlass);
/** Explicit search-field exception: an empty lens, without changing filled Search elsewhere. */
export const SearchOutline = /* @__PURE__ */ forwardRef<SVGSVGElement, IconProps>(function SearchOutline({
	size = 24,
	strokeWidth: _strokeWidth,
	absoluteStrokeWidth: _absoluteStrokeWidth,
	stroke: _stroke,
	fill: _fill,
	...props
}, ref) {
	const hasName = Boolean(props["aria-label"] || props["aria-labelledby"] || props.alt);
	const iconProps = {
		"aria-hidden": hasName ? undefined : true,
		focusable: false,
		...props,
		ref,
		size,
		weight: "regular" as const,
		stroke: "none",
		"data-icon-family": "phosphor",
		"data-icon-weight": "regular",
	};
	return createElement(PhosphorMagnifyingGlass, iconProps);
});
export const Server = /* @__PURE__ */ filledIcon("Server", PhosphorHardDrives);
export const ServerCog = /* @__PURE__ */ filledIcon("ServerCog", PhosphorHardDrives);
export const ServerOff = /* @__PURE__ */ filledIcon("ServerOff", PhosphorCloudSlash);
export const Settings2 = /* @__PURE__ */ filledIcon("Settings2", PhosphorSlidersHorizontal);
export const Shield = /* @__PURE__ */ filledIcon("Shield", PhosphorShield);
export const ShieldAlert = /* @__PURE__ */ filledIcon("ShieldAlert", PhosphorShieldWarning);
export const ShieldCheck = /* @__PURE__ */ filledIcon("ShieldCheck", PhosphorShieldCheck);
export const SlidersHorizontal = /* @__PURE__ */ filledIcon("SlidersHorizontal", PhosphorSlidersHorizontal);
export const Sparkles = /* @__PURE__ */ filledIcon("Sparkles", PhosphorSparkle);
export const SquareTerminal = /* @__PURE__ */ filledIcon("SquareTerminal", PhosphorTerminalWindow);
export const Store = /* @__PURE__ */ filledIcon("Store", PhosphorStorefront);
export const Sun = /* @__PURE__ */ filledIcon("Sun", PhosphorSun);
export const Terminal = /* @__PURE__ */ filledIcon("Terminal", PhosphorTerminalWindow);
export const TerminalSquare = /* @__PURE__ */ filledIcon("TerminalSquare", PhosphorTerminalWindow);
export const Trash2 = /* @__PURE__ */ filledIcon("Trash2", PhosphorTrash);
export const TriangleAlert = /* @__PURE__ */ filledIcon("TriangleAlert", PhosphorWarning);
export const UserRound = /* @__PURE__ */ filledIcon("UserRound", PhosphorUser);
export const UsersRound = /* @__PURE__ */ filledIcon("UsersRound", PhosphorUsers);
export const Volume2 = /* @__PURE__ */ filledIcon("Volume2", PhosphorSpeakerHigh);
export const Wifi = /* @__PURE__ */ filledIcon("Wifi", PhosphorWifiHigh);
export const Workflow = /* @__PURE__ */ filledIcon("Workflow", PhosphorFlowArrow);
export const Wrench = /* @__PURE__ */ filledIcon("Wrench", PhosphorWrench);
export const X = /* @__PURE__ */ filledIcon("X", PhosphorX);
export const Zap = /* @__PURE__ */ filledIcon("Zap", PhosphorLightning);
