/** CSS gears have different durations but must share the same elapsed time. */
export function synchronizeGearClocks(element: ParentNode) {
	const animations = [...element.querySelectorAll<SVGElement>("[data-worker-gear]")]
		.map(gear => ({
			core: gear.dataset.workerGear === "core",
			animation: gear.getAnimations().find(animation => (animation as CSSAnimation).animationName === "spin"),
		}));
	const coreTime = animations.find(gear => gear.core)?.animation?.currentTime;
	if (typeof coreTime !== "number") return;
	for (const { animation } of animations) {
		// Reduced-motion CSS removes the animation entirely. Do not create one.
		if (animation && animation.currentTime !== coreTime) animation.currentTime = coreTime;
	}
}
