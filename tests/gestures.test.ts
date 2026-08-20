import { describe, expect, it } from "vitest";
import { isDismissSwipe, isHorizontalSwipe, startsInHorizontalScroller } from "../src/ui/gestures";

describe("study gestures", () => {
	it("requires a clearly horizontal swipe", () => {
		expect(isHorizontalSwipe(-80, 20)).toBe(true);
		expect(isHorizontalSwipe(55, 0)).toBe(false);
		expect(isHorizontalSwipe(80, 60)).toBe(false);
	});

	it("dismisses a sheet only on a clear downward pull", () => {
		expect(isDismissSwipe(0, 90)).toBe(true);
		expect(isDismissSwipe(10, 40)).toBe(false);
		expect(isDismissSwipe(90, 80)).toBe(false);
		expect(isDismissSwipe(0, -90)).toBe(false);
	});

	it("detects a horizontally scrollable block in the target ancestry", () => {
		const scroller = {
			matches: (selector: string) => selector === '[data-overflow="scroll"]',
			scrollWidth: 480,
			clientWidth: 240,
			parentElement: null,
		};
		const child = { matches: () => false, scrollWidth: 0, clientWidth: 0, parentElement: scroller };
		expect(startsInHorizontalScroller(child)).toBe(true);
		expect(startsInHorizontalScroller({ ...scroller, scrollWidth: 240 })).toBe(false);
	});
});
