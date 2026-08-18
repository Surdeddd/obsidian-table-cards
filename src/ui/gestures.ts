export interface SwipeHandlers {
	onNext: () => void;
	onPrev: () => void;
}

interface ScrollTarget {
	matches?: (selector: string) => boolean;
	scrollWidth?: number;
	clientWidth?: number;
	parentElement?: ScrollTarget | null;
}

export function isHorizontalSwipe(dx: number, dy: number): boolean {
	return Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy) * 1.5;
}

export function startsInHorizontalScroller(target: unknown): boolean {
	let node = target as ScrollTarget | null;
	while (node) {
		if (
			node.matches?.('[data-overflow="scroll"]') &&
			typeof node.scrollWidth === "number" &&
			typeof node.clientWidth === "number" &&
			node.scrollWidth > node.clientWidth
		) {
			return true;
		}
		node = node.parentElement ?? null;
	}
	return false;
}

export function attachSwipe(el: HTMLElement, handlers: SwipeHandlers): () => void {
	let startX = 0;
	let startY = 0;
	let tracking = false;
	let swiped = false;
	let blocked = false;

	const onStart = (event: PointerEvent): void => {
		if (event.pointerType === "mouse" && event.button !== 0) {
			return;
		}
		tracking = true;
		swiped = false;
		blocked = startsInHorizontalScroller(event.target);
		startX = event.clientX;
		startY = event.clientY;
	};

	const onEnd = (event: PointerEvent): void => {
		if (!tracking) {
			return;
		}
		tracking = false;
		const dx = event.clientX - startX;
		const dy = event.clientY - startY;
		if (blocked || !isHorizontalSwipe(dx, dy)) {
			return;
		}
		swiped = true;
		if (dx < 0) {
			handlers.onNext();
		} else {
			handlers.onPrev();
		}
	};

	const onCancel = (): void => {
		tracking = false;
	};

	const onClick = (event: Event): void => {
		if (!swiped) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		swiped = false;
	};

	el.addEventListener("pointerdown", onStart);
	el.addEventListener("pointerup", onEnd);
	el.addEventListener("pointercancel", onCancel);
	el.addEventListener("click", onClick, true);
	return () => {
		el.removeEventListener("pointerdown", onStart);
		el.removeEventListener("pointerup", onEnd);
		el.removeEventListener("pointercancel", onCancel);
		el.removeEventListener("click", onClick, true);
	};
}
