"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ReactLenis, type LenisRef } from "lenis/react";
import { usePathname } from "next/navigation";
import {
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * Smooth scrolling + scroll-triggered section reveals. NOT page transitions.
 *
 * This provider used to also own two route-level effects, removed 2026-08-03
 * at the user's request after both misbehaved on the dashboard:
 *
 *  - A "route curtain" that captured every same-origin link click, played a
 *    three-panel wipe, and only then called router.push -- with a 4.5s
 *    fallback timer as the only guarantee the curtain ever left the screen.
 *    Any hiccup between the click and the next route's mount left the user
 *    staring at panels.
 *  - A route-enter tween from `autoAlpha: 0, filter: blur(7px)` over the
 *    whole shell on every pathname change. `clearProps` only ran when the
 *    tween COMPLETED; interrupt it (fast navigation, revertOnUpdate racing
 *    the next route) and the page stayed dimmed and blurred -- which is
 *    exactly how the machine dashboard was captured in the 2026-08-03
 *    screenshot that triggered the removal.
 *
 * An app surface (the dashboard) shares this layout with the marketing
 * pages, and an interaction cost that is tolerable on a landing page is not
 * tolerable on a working console. What stays is scroll behavior only: Lenis
 * smoothing, the top progress bar, and the ScrollTrigger reveals for
 * `[data-motion-section]` marketing sections -- none of which run between
 * routes or gate navigation.
 */

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

export function MotionProvider({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const lenisRef = useRef<LenisRef>(null);
	const shellRef = useRef<HTMLDivElement>(null);
	const progressRef = useRef<HTMLDivElement>(null);
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

	useGSAP(
		() => {
			const shell = shellRef.current;
			if (!shell) return;

			if (prefersReducedMotion) {
				gsap.set(
					shell.querySelectorAll<HTMLElement>(
						"[data-motion-section], .ret-page-enter, [data-motion-item]",
					),
					{ clearProps: "all" },
				);
				return;
			}

			// Scroll reveals only. These never touch the route root, so a route
			// change can no longer strand the whole page dimmed or blurred --
			// the worst an interrupted reveal can do is one marketing section.
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
			dependencies: [pathname, prefersReducedMotion],
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
		</>
	);
}
