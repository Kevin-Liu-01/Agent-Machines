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
		"hover:opacity-90 disabled:hover:opacity-50 aria-disabled:hover:opacity-50",
	),
	secondary: cn(
		"border border-[var(--ret-border-hover)] text-[var(--ret-text)]",
		"hover:border-[var(--ret-purple)]/40 hover:bg-[var(--ret-surface)] disabled:hover:border-[var(--ret-border-hover)] disabled:hover:bg-transparent aria-disabled:hover:border-[var(--ret-border-hover)] aria-disabled:hover:bg-transparent",
	),
	ghost: cn(
		"text-[var(--ret-text-secondary)]",
		"hover:bg-[var(--ret-surface)] hover:text-[var(--ret-text)] disabled:hover:bg-transparent disabled:hover:text-[var(--ret-text-secondary)] aria-disabled:hover:bg-transparent aria-disabled:hover:text-[var(--ret-text-secondary)]",
	),
};

const SIZE: Record<Size, string> = {
	sm: "px-3 py-1.5 text-sm gap-2",
	md: "px-5 py-2.5 text-sm gap-2",
	lg: "px-7 py-3 text-sm gap-2",
};

const BASE = cn(
	"inline-flex min-h-10 items-center justify-center rounded-sm font-medium leading-5",
	"cursor-pointer select-none transition-[transform,opacity,color,background-color,border-color] duration-[var(--ret-duration-press)] ease-[var(--ret-ease-out)]",
	"active:[transform:scale(0.98)] focus-visible:active:[transform:none] focus-visible:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ret-text)]",
	"motion-reduce:transition-none motion-reduce:active:[transform:none]",
	"disabled:cursor-not-allowed disabled:opacity-50 disabled:[transform:none] disabled:transition-none",
	"aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:[transform:none] aria-disabled:transition-none",
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
