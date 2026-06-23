import { cn } from "@/lib/cn";

type Props = {
	size?: number;
	className?: string;
};

export function VercelMark({ size = 14, className }: Props) {
	const dim = `${size}px`;
	return (
		<svg
			role="img"
			aria-label="Vercel"
			viewBox="0 0 74 64"
			className={cn("inline-block shrink-0", className)}
			style={{ width: dim, height: dim }}
			fill="currentColor"
		>
			<path d="M37.5896 0.25L74.5396 64.25H0.639648L37.5896 0.25Z" />
		</svg>
	);
}
