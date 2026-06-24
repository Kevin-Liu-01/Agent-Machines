"use client";

import type {
	AnchorHTMLAttributes,
	ButtonHTMLAttributes,
	ReactNode,
} from "react";
import { forwardRef } from "react";

import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
	primary: cn(
		"bg-[var(--ret-accent)] text-[var(--ret-bg)]",
		"hover:shadow-[0_0_24px_var(--ret-purple-glow)] hover:brightness-110",
	),
	secondary: cn(
		"border border-[var(--ret-border-hover)] text-[var(--ret-text)]",
		"hover:border-[var(--ret-purple)]/40 hover:bg-[var(--ret-surface)]",
	),
	ghost: cn(
		"text-[var(--ret-text-secondary)]",
		"hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)]",
	),
};

const SIZE: Record<Size, string> = {
	sm: "px-3 py-1.5 text-sm gap-1.5",
	md: "px-5 py-2.5 text-sm gap-2",
	lg: "px-7 py-3 text-sm gap-2",
};

const BASE = cn(
	"inline-flex min-h-10 items-center justify-center font-medium",
	"ret-pressable cursor-pointer select-none",
	"disabled:cursor-not-allowed disabled:opacity-50",
);

type SharedProps = {
	variant?: Variant;
	size?: Size;
	children?: ReactNode;
};

type ButtonProps = SharedProps &
	ButtonHTMLAttributes<HTMLButtonElement> & {
		as?: "button";
		href?: never;
	};

type AnchorProps = SharedProps &
	AnchorHTMLAttributes<HTMLAnchorElement> & {
		as: "a";
		href: string;
	};

export type ReticleButtonProps = ButtonProps | AnchorProps;

export const ReticleButton = forwardRef<
	HTMLButtonElement | HTMLAnchorElement,
	ReticleButtonProps
>(function ReticleButton(props, ref) {
	const { variant = "primary", size = "md", className, as, ...rest } = props;
	const classes = cn(BASE, VARIANT[variant], SIZE[size], className);

	if (as === "a") {
		const { href, ...anchorRest } = rest as AnchorProps;
		return (
			<a
				ref={ref as React.Ref<HTMLAnchorElement>}
				href={href}
				className={classes}
				{...anchorRest}
			/>
		);
	}
	return (
		<button
			ref={ref as React.Ref<HTMLButtonElement>}
			className={classes}
			{...(rest as ButtonProps)}
		/>
	);
});
