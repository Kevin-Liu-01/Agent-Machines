import { Check, Circle, TriangleAlert, X } from "lucide-react";

import { cn } from "@/lib/cn";

type Status = "success" | "warning" | "error" | "idle";

const ICONS = {
	success: Check,
	warning: TriangleAlert,
	error: X,
	idle: Circle,
} as const;

export function StatusGlyph({
	status,
	size = 12,
	className,
}: {
	status: Status;
	size?: number;
	className?: string;
}) {
	const Icon = ICONS[status];
	return (
		<Icon
			width={size}
			height={size}
			strokeWidth={status === "idle" ? 2 : 2.25}
			className={cn("shrink-0", className)}
			aria-hidden
		/>
	);
}
