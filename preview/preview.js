const focusableSelector = [
	'button:not([disabled])',
	'input:not([disabled])',
	'summary',
	'[href]',
	'[tabindex]:not([tabindex="-1"])',
].join(',');

if (new URLSearchParams(location.search).get('capture') === '1') {
	document.documentElement.classList.add('is-capture');
}

/** @param {Element} root @returns {HTMLElement[]} */
export function visibleFocusable(root) {
	return /** @type {HTMLElement[]} */ (Array.from(root.querySelectorAll(focusableSelector))
		.filter((element) => element instanceof HTMLElement && !element.hidden && element.getClientRects().length > 0));
}

/** @param {KeyboardEvent} event @param {Element} root */
export function trapTab(event, root) {
	if (event.key !== 'Tab') return;
	const items = visibleFocusable(root);
	const first = items[0];
	const last = items.at(-1);
	if (!first || !last) return;
	if (event.shiftKey && document.activeElement === first) {
		event.preventDefault();
		last.focus();
	} else if (!event.shiftKey && document.activeElement === last) {
		event.preventDefault();
		first.focus();
	}
}

/** @param {Iterable<Element>} group @param {Element | null | undefined} active */
export function setPressed(group, active) {
	for (const button of group) {
		button.setAttribute('aria-pressed', String(button === active));
	}
}

/**
 * @param {{
 *   buttons: string,
 *   panels: string,
 *   initial: string,
 *   onChange?: (name: string) => void,
 * }} options
 */
export function stateController({ buttons, panels, initial, onChange }) {
	const controls = Array.from(document.querySelectorAll(buttons));
	const fixtures = Array.from(document.querySelectorAll(panels));
	/** @param {string | undefined} requested @param {boolean} focus */
	const show = (requested, focus = false) => {
		const name = fixtures.some((fixture) => fixture instanceof HTMLElement && fixture.dataset.state === requested)
			? requested ?? initial
			: initial;
		for (const control of controls) {
			if (control instanceof HTMLElement) control.setAttribute('aria-pressed', String(control.dataset.state === name));
		}
		for (const fixture of fixtures) {
			if (fixture instanceof HTMLElement) fixture.hidden = fixture.dataset.state !== name;
		}
		onChange?.(name);
		if (focus) {
			const active = fixtures.find((fixture) => fixture instanceof HTMLElement && fixture.dataset.state === name);
			if (active instanceof HTMLElement) active.focus();
		}
	};
	for (const control of controls) {
		if (control instanceof HTMLElement) control.addEventListener('click', () => show(control.dataset.state));
	}
	show(new URLSearchParams(location.search).get('state') || initial);
	return { show };
}

/** @param {HTMLElement} trigger @param {HTMLElement} popover */
export function placeAnchoredPopover(trigger, popover) {
	const mobile = matchMedia("(max-width: 700px)").matches;
	popover.classList.toggle("is-mobile-sheet", mobile);
	if (mobile) {
		popover.removeAttribute("style");
		return;
	}
	const rect = trigger.getBoundingClientRect();
	const gutter = 8;
	const width = Math.min(Math.max(rect.width, 220), window.innerWidth - gutter * 2);
	const left = Math.min(Math.max(gutter, rect.left), window.innerWidth - width - gutter);
	const spaceBelow = window.innerHeight - rect.bottom - gutter;
	const spaceAbove = rect.top - gutter;
	const flip = spaceBelow < 168 && spaceAbove > spaceBelow;
	const maxHeight = Math.max(96, Math.min(360, flip ? spaceAbove : spaceBelow));
	const top = flip ? Math.max(gutter, rect.top - maxHeight - 5) : rect.bottom + 5;
	popover.classList.toggle("is-above", flip);
	Object.assign(popover.style, {
		position: "fixed",
		top: `${top}px`,
		left: `${left}px`,
		width: `${width}px`,
		right: "auto",
		bottom: "auto",
		maxHeight: `${maxHeight}px`,
		zIndex: "80",
	});
}

export function layerController() {
	/** @type {Array<{ layer: HTMLElement, opener: HTMLElement }>} */
	const stack = [];
	/** @param {HTMLElement | null} layer @param {HTMLElement | null} opener @param {string} [focusSelector] */
	const open = (layer, opener, focusSelector) => {
		if (!layer || !opener) return;
		layer.hidden = false;
		opener.setAttribute('aria-expanded', 'true');
		stack.push({ layer, opener });
		if (layer.classList.contains("tc-listbox-popover")) placeAnchoredPopover(opener, layer);
		requestAnimationFrame(() => {
			const target = focusSelector ? layer.querySelector(focusSelector) : visibleFocusable(layer)[0];
			if (target instanceof HTMLElement) target.focus();
		});
	};
	/** @param {HTMLElement | null} layer @param {boolean} restoreFocus */
	const close = (layer, restoreFocus = true) => {
		if (!layer) return;
		const index = stack.findLastIndex((item) => item.layer === layer);
		const entry = index >= 0 ? stack.splice(index, 1)[0] : null;
		layer.hidden = true;
		entry?.opener.setAttribute('aria-expanded', 'false');
		if (restoreFocus) requestAnimationFrame(() => entry?.opener.focus());
	};
	const closeTop = () => {
		const entry = stack.at(-1);
		if (!entry) return false;
		close(entry.layer);
		return true;
	};
	document.addEventListener('keydown', (event) => {
		const top = stack.at(-1);
		if (event.key === 'Escape' && top) {
			event.preventDefault();
			event.stopPropagation();
			closeTop();
			return;
		}
		if (top) trapTab(event, top.layer.querySelector('[role="dialog"]') ?? top.layer);
	});
	return { open, close, closeTop, stack };
}

export function installDialogFocusTrap() {
	document.addEventListener('keydown', (event) => {
		if (event.defaultPrevented || event.key !== 'Tab') return;
		const dialogs = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]'))
			.filter((dialog) => dialog instanceof HTMLElement && dialog.getClientRects().length > 0);
		const active = dialogs.at(-1);
		if (active) trapTab(event, active);
	});
}

export function installNoOverflowSignal() {
	const update = () => {
		document.documentElement.dataset.horizontalOverflow = String(
			document.documentElement.scrollWidth > document.documentElement.clientWidth,
		);
	};
	new ResizeObserver(update).observe(document.documentElement);
	window.addEventListener('load', update, { once: true });
	update();
}
