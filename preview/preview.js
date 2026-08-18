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

export function visibleFocusable(root) {
	return Array.from(root.querySelectorAll(focusableSelector))
		.filter((element) => !element.hidden && element.getClientRects().length > 0);
}

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

export function setPressed(group, active) {
	for (const button of group) {
		button.setAttribute('aria-pressed', String(button === active));
	}
}

export function stateController({ buttons, panels, initial, onChange }) {
	const controls = Array.from(document.querySelectorAll(buttons));
	const fixtures = Array.from(document.querySelectorAll(panels));
	const show = (name, focus = false) => {
		for (const control of controls) {
			control.setAttribute('aria-pressed', String(control.dataset.state === name));
		}
		for (const fixture of fixtures) fixture.hidden = fixture.dataset.state !== name;
		onChange?.(name);
		if (focus) fixtures.find((fixture) => fixture.dataset.state === name)?.focus?.();
	};
	for (const control of controls) control.addEventListener('click', () => show(control.dataset.state));
	show(new URLSearchParams(location.search).get('state') || initial);
	return { show };
}

export function layerController() {
	const stack = [];
	const open = (layer, opener, focusSelector) => {
		if (!layer || !opener) return;
		layer.hidden = false;
		opener.setAttribute('aria-expanded', 'true');
		stack.push({ layer, opener });
		requestAnimationFrame(() => {
			const target = focusSelector ? layer.querySelector(focusSelector) : visibleFocusable(layer)[0];
			target?.focus();
		});
	};
	const close = (layer, restoreFocus = true) => {
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
		if (top) trapTab(event, top.layer);
	});
	return { open, close, closeTop, stack };
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
