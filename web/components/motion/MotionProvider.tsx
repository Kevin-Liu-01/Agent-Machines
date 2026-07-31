"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ReactLenis, type LenisRef } from "lenis/react";
import { usePathname, useRouter } from "next/navigation";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const NATIVE_SCROLL_SELECTOR = [
	"[data-lenis-prevent]",
	"[data-radix-scroll-area-viewport]",
	"[role='dialog']",
	".xterm",
	".xterm-viewport",
	".cm-scroller",
].join(",");

function shouldUseNativeScroll(node: HTMLElement) {
	if (node === document.body || node === document.documentElement) return false;
	if (node.closest(NATIVE_SCROLL_SELECTOR)) return true;

	const style = window.getComputedStyle(node);
	const scrollsVertically =
		node.scrollHeight > node.clientHeight &&
		(style.overflowY === "auto" || style.overflowY === "scroll");
	const scrollsHorizontally =
		node.scrollWidth > node.clientWidth &&
		(style.overflowX === "auto" || style.overflowX === "scroll");

	return scrollsVertically || scrollsHorizontally;
}

function MotionMark() {
	return (
		<svg aria-hidden="true" height="34" viewBox="0 0 32 32" width="34">
			<path
				fill="#9b98a8"
				d="M10 4h12v6H10V4ZM4 10h6v12H4V10ZM22 10h6v12h-6V10ZM10 22h12v6H10V22Z"
			/>
			<path
				fill="#fff"
				d="M23 5h4v4h-4V5ZM10 10h6v6h-6v-6ZM16 16h6v6h-6v-6ZM5 23h4v4H5v-4Z"
			/>
			<path
				fill="#09090b"
				d="M16 10h6v6h-6v-6ZM10 16h6v6h-6v-6Z"
			/>
		</svg>
	);
}

export function MotionProvider({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const router = useRouter();
	const lenisRef = useRef<LenisRef>(null);
	const shellRef = useRef<HTMLDivElement>(null);
	const curtainRef = useRef<HTMLDivElement>(null);
	const identityRef = useRef<HTMLDivElement>(null);
	const progressRef = useRef<HTMLDivElement>(null);
	const isTransitioningRef = useRef(false);
	const fallbackTimerRef = useRef<number | null>(null);
	const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

	useEffect(() => {
		const media = window.matchMedia(REDUCED_MOTION_QUERY);
		const updatePreference = () => setPrefersReducedMotion(media.matches);
		updatePreference();
		media.addEventListener("change", updatePreference);
		return () => media.removeEventListener("change", updatePreference);
	}, []);

	useEffect(() => {
		document.documentElement.classList.add("am-motion-ready");
		return () => document.documentElement.classList.remove("am-motion-ready");
	}, []);

	const lenisOptions = useMemo(
		() => ({
			autoRaf: false,
			anchors: { offset: -76 },
			lerp: 0.11,
			overscroll: true,
			prevent: shouldUseNativeScroll,
			smoothWheel: !prefersReducedMotion,
			stopInertiaOnNavigate: true,
			syncTouch: false,
			wheelMultiplier: 0.88,
		}),
		[prefersReducedMotion],
	);

	useEffect(() => {
		let connectedLenis = lenisRef.current?.lenis;
		let connectFrame = 0;
		const update = (time: number) => {
			lenisRef.current?.lenis?.raf(time * 1000);
		};
		const onScroll = () => {
			ScrollTrigger.update();
			if (connectedLenis && progressRef.current) {
				gsap.set(progressRef.current, { scaleX: connectedLenis.progress });
			}
		};
		const connectLenis = () => {
			connectedLenis = lenisRef.current?.lenis;
			if (!connectedLenis) {
				connectFrame = window.requestAnimationFrame(connectLenis);
				return;
			}
			connectedLenis.on("scroll", onScroll);
			onScroll();
		};

		gsap.ticker.add(update);
		gsap.ticker.lagSmoothing(0);
		connectFrame = window.requestAnimationFrame(connectLenis);

		return () => {
			window.cancelAnimationFrame(connectFrame);
			connectedLenis?.off("scroll", onScroll);
			gsap.ticker.remove(update);
		};
	}, [prefersReducedMotion]);

	const resetCurtain = useCallback(() => {
		const curtain = curtainRef.current;
		if (!curtain) return;
		const panels = curtain.querySelectorAll<HTMLElement>(
			".am-route-curtain__panel",
		);

		gsap.killTweensOf([curtain, identityRef.current, ...panels]);
		gsap
			.timeline({
				onComplete: () => {
					isTransitioningRef.current = false;
					gsap.set(curtain, {
						autoAlpha: 0,
						pointerEvents: "none",
					});
				},
			})
			.to(identityRef.current, {
				autoAlpha: 0,
				duration: 0.18,
				ease: "power2.out",
				y: -6,
			})
			.set(panels, { transformOrigin: "right center" }, 0)
			.to(
				panels,
				{
					duration: prefersReducedMotion ? 0 : 0.62,
					ease: "expo.inOut",
					scaleX: 0,
					stagger: prefersReducedMotion ? 0 : 0.045,
				},
				0,
			);
	}, [prefersReducedMotion]);

	const navigateWithCurtain = useCallback(
		(destination: string) => {
			if (prefersReducedMotion) {
				router.push(destination);
				return;
			}

			const curtain = curtainRef.current;
			if (!curtain || isTransitioningRef.current) return;
			isTransitioningRef.current = true;
			const panels = curtain.querySelectorAll<HTMLElement>(
				".am-route-curtain__panel",
			);

			gsap.killTweensOf([curtain, identityRef.current, ...panels]);
			gsap
				.timeline({
					onComplete: () => {
					router.push(destination);
					fallbackTimerRef.current = window.setTimeout(
						resetCurtain,
						4500,
					);
				},
				})
				.set(curtain, { autoAlpha: 1, pointerEvents: "auto" })
				.set(panels, {
					scaleX: 0,
					transformOrigin: "left center",
				})
				.to(panels, {
					duration: 0.48,
					ease: "power4.inOut",
					scaleX: 1,
					stagger: 0.04,
				})
				.fromTo(
					identityRef.current,
					{ autoAlpha: 0, y: 8 },
					{
						autoAlpha: 1,
						duration: 0.24,
						ease: "power3.out",
						y: 0,
					},
					"-=0.2",
				);
		},
		[prefersReducedMotion, resetCurtain, router],
	);

	useEffect(() => {
		const handleInternalLink = (event: MouseEvent) => {
			if (
				event.defaultPrevented ||
				event.button !== 0 ||
				event.metaKey ||
				event.ctrlKey ||
				event.shiftKey ||
				event.altKey
			) {
				return;
			}

			const target = event.target;
			if (!(target instanceof Element)) return;
			const anchor = target.closest<HTMLAnchorElement>("a[href]");
			if (
				!anchor ||
				anchor.target === "_blank" ||
				anchor.hasAttribute("download") ||
				anchor.hasAttribute("data-no-transition")
			) {
				return;
			}

			const url = new URL(anchor.href, window.location.href);
			if (
				url.origin !== window.location.origin ||
				url.pathname === window.location.pathname
			) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			navigateWithCurtain(`${url.pathname}${url.search}${url.hash}`);
		};

		document.addEventListener("click", handleInternalLink, true);
		return () => document.removeEventListener("click", handleInternalLink, true);
	}, [navigateWithCurtain]);

	useGSAP(
		() => {
			if (fallbackTimerRef.current !== null) {
				window.clearTimeout(fallbackTimerRef.current);
				fallbackTimerRef.current = null;
			}
			resetCurtain();

			const shell = shellRef.current;
			if (!shell) return;
			const routeTarget =
				shell.querySelector<HTMLElement>("[data-motion-route-root]") ?? shell;

			if (prefersReducedMotion) {
				gsap.set(routeTarget, { clearProps: "all" });
				gsap.set(
					shell.querySelectorAll<HTMLElement>(
						"[data-motion-section], .ret-page-enter, [data-motion-item]",
					),
					{ clearProps: "all" },
				);
				return;
			}

			gsap
				.timeline()
				.fromTo(
					routeTarget,
					{ autoAlpha: 0, filter: "blur(7px)", y: 14 },
					{
						autoAlpha: 1,
						duration: 0.62,
						ease: "power3.out",
						filter: "blur(0px)",
						y: 0,
					},
				)
				.set(routeTarget, { clearProps: "transform,filter" });

			const sections = shell.querySelectorAll<HTMLElement>(
				"[data-motion-section]",
			);
			sections.forEach((section) => {
				const items = section.querySelectorAll<HTMLElement>(
					".ret-page-enter, [data-motion-item]",
				);
				const targets = items.length > 0 ? Array.from(items) : [section];

				gsap.fromTo(
					targets,
					{ autoAlpha: 0, y: 28 },
					{
						autoAlpha: 1,
						duration: 0.76,
						ease: "power3.out",
						scrollTrigger: {
							once: true,
							start: "top 88%",
							trigger: section,
						},
						stagger: items.length > 0 ? 0.065 : 0,
						y: 0,
					},
				);
			});

			requestAnimationFrame(() => ScrollTrigger.refresh());
		},
		{
			dependencies: [pathname, prefersReducedMotion, resetCurtain],
			revertOnUpdate: true,
			scope: shellRef,
		},
	);

	return (
		<>
			<ReactLenis ref={lenisRef} root options={lenisOptions} />
			<div ref={shellRef} className="am-route-shell">
				{children}
			</div>
			<div className="am-scroll-progress" ref={progressRef} aria-hidden="true" />
			<div
				aria-hidden="true"
				className="am-route-curtain"
				ref={curtainRef}
			>
				<div className="am-route-curtain__panel" />
				<div className="am-route-curtain__panel" />
				<div className="am-route-curtain__panel" />
				<div className="am-route-curtain__identity" ref={identityRef}>
					<MotionMark />
					<span>agent-machines</span>
				</div>
			</div>
		</>
	);
}
