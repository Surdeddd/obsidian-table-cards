import {
	installDialogFocusTrap,
	installNoOverflowSignal,
	layerController,
	stateController,
} from './preview.js';

/** @param {string} selector */
function requiredElement(selector) {
	const element = document.querySelector(selector);
	if (!(element instanceof HTMLElement)) throw new Error(`Launcher fixture is missing: ${selector}`);
	return element;
}

const layers = layerController();
const desktopPicker = requiredElement('[data-selector-root="desktop"]');

/** @param {string} name @param {Element | null} mount */
function clonePicker(name, mount) {
	if (!(mount instanceof HTMLElement)) throw new Error(`Selector mount is missing: ${name}`);
	const clone = desktopPicker.cloneNode(true);
	if (!(clone instanceof HTMLElement)) throw new Error(`Could not clone selector: ${name}`);
	clone.hidden = false;
	clone.classList.remove('preview-desktop-scope');
	if (name === 'locked') {
		const checkboxes = Array.from(clone.querySelectorAll('input[type="checkbox"]'))
			.filter((input) => input instanceof HTMLInputElement);
		for (const [index, checkbox] of checkboxes.entries()) checkbox.checked = index === 0;
	}
	if (name === 'mobile') {
		clone.classList.add('is-mobile');
		clone.removeAttribute('data-selector-root');
		const shell = mount.closest('.tc-sheet');
		const actions = clone.querySelector('.tc-scope-actions');
		const footer = shell?.querySelector('[data-selector-actions="mobile"]');
		if (!(shell instanceof HTMLElement) || !(actions instanceof HTMLElement) || !(footer instanceof HTMLElement)) {
			throw new Error('Mobile selector shell is incomplete');
		}
		footer.append(...actions.children);
		actions.remove();
		shell.dataset.selectorRoot = name;
		mount.append(clone);
		return shell;
	}
	clone.dataset.selectorRoot = name;
	mount.append(clone);
	return clone;
}

const generalPicker = clonePicker('general', document.querySelector('[data-selector-mount="general"]'));
const lockedPicker = clonePicker('locked', document.querySelector('[data-selector-mount="locked"]'));
const mobilePicker = clonePicker('mobile', document.querySelector('[data-selector-mount="mobile"]'));

/** @param {HTMLElement} root */
function selectorLayer(root) {
	if (root.dataset.selectorRoot === 'general' || root.dataset.selectorRoot === 'locked') return root.parentElement;
	if (root.dataset.selectorRoot === 'mobile') return root.closest('.preview-mobile-scope');
	return root;
}

/** @param {HTMLElement} root */
function installSelector(root) {
	const section = root.closest('[data-state]');
	if (!(section instanceof HTMLElement)) throw new Error('Selector state is missing');
	const checkboxes = Array.from(root.querySelectorAll('input[type="checkbox"]'))
		.filter((input) => input instanceof HTMLInputElement);
	const scopeName = root.dataset.selectorRoot === 'general' || root.dataset.selectorRoot === 'locked'
		? root.dataset.selectorRoot
		: 'selector';
	const opener = section.querySelector(`[data-scope-open="${scopeName}"]`);
	if (!(opener instanceof HTMLElement)) throw new Error(`Selector opener is missing: ${scopeName}`);

	const update = () => {
		const selected = checkboxes.filter((input) => input.checked);
		const cards = selected.reduce((total, input) => total + Number(input.dataset.cards ?? 0), 0);
		const count = selected.length;
		const tableLabel = count === 1 ? 'table' : 'tables';
		const summary = section.querySelector('[data-live-summary]');
		const start = section.querySelector('[data-live-start]');
		const triggerValue = opener.querySelector('.tc-scope-trigger-value');
		if (summary) summary.textContent = `${cards} cards · ${count} ${tableLabel}`;
		if (triggerValue) triggerValue.textContent = `${count} ${tableLabel}`;
		if (start instanceof HTMLButtonElement) {
			start.textContent = `Open cards: ${cards}`;
			start.disabled = count === 0;
		}
		for (const group of root.querySelectorAll('.tc-scope-group')) {
			const groupBoxes = Array.from(group.querySelectorAll('input[type="checkbox"]'))
				.filter((input) => input instanceof HTMLInputElement);
			const groupSelected = groupBoxes.filter((input) => input.checked).length;
			const groupCount = group.querySelector('.tc-scope-group-count');
			const groupToggle = group.querySelector('[data-group-toggle]');
			if (groupCount) groupCount.textContent = `${groupSelected} / ${groupBoxes.length}`;
			if (groupToggle) groupToggle.textContent = groupSelected === groupBoxes.length ? 'Clear' : 'Select all';
		}
	};

	for (const checkbox of checkboxes) checkbox.addEventListener('change', update);
	for (const group of root.querySelectorAll('.tc-scope-group')) {
		group.querySelector('[data-group-toggle]')?.addEventListener('click', () => {
			const groupBoxes = Array.from(group.querySelectorAll('input[type="checkbox"]'))
				.filter((input) => input instanceof HTMLInputElement);
			const select = groupBoxes.some((input) => !input.checked);
			for (const checkbox of groupBoxes) checkbox.checked = select;
			update();
		});
	}
	root.querySelector('[data-clear-all]')?.addEventListener('click', () => {
		for (const checkbox of checkboxes) checkbox.checked = false;
		update();
	});
	root.querySelector('[data-apply]')?.addEventListener('click', () => {
		const layer = selectorLayer(root);
		if (layer instanceof HTMLElement) layers.close(layer);
	});
	update();
}

for (const root of [desktopPicker, generalPicker, lockedPicker, mobilePicker]) installSelector(root);

/** @param {'general' | 'locked' | 'selector'} name */
function openScope(name) {
	const opener = document.querySelector(`[data-state="${name}"] [data-scope-open="${name}"]`);
	const mobile = name === 'selector' && matchMedia('(max-width: 700px)').matches;
	const layer = name === 'general'
		? document.querySelector('[data-selector-mount="general"]')
		: name === 'locked'
			? document.querySelector('[data-selector-mount="locked"]')
		: mobile
			? document.querySelector('.preview-mobile-scope')
			: desktopPicker;
	if (!(opener instanceof HTMLElement) || !(layer instanceof HTMLElement)) return;
	if (layer.hidden) layers.open(layer, opener, '.tc-scope-search');
	else layers.close(layer);
}

for (const opener of document.querySelectorAll('[data-scope-open]')) {
	if (!(opener instanceof HTMLElement)) continue;
	opener.addEventListener('click', () => {
		const scope = opener.dataset.scopeOpen;
		openScope(scope === 'general' || scope === 'locked' ? scope : 'selector');
	});
}

for (const opener of document.querySelectorAll('[data-open-layer]')) {
	if (!(opener instanceof HTMLElement)) continue;
	opener.addEventListener('click', () => {
		const layer = document.getElementById(opener.dataset.openLayer ?? '');
		if (!layer) return;
		if (!layer.hidden) layers.close(layer);
		else layers.open(layer, opener, '[aria-selected="true"], input, button');
	});
}

for (const option of document.querySelectorAll('#general-decks [role="option"]')) {
	option.addEventListener('click', () => {
		for (const candidate of document.querySelectorAll('#general-decks [role="option"]')) {
			candidate.setAttribute('aria-selected', String(candidate === option));
		}
		const value = document.getElementById('general-deck-value');
		if (value) value.textContent = option.textContent;
		layers.close(document.getElementById('general-decks'));
	});
}

const states = stateController({
	buttons: '.preview-toolbar [data-state]',
	panels: '.preview-root > [data-state]',
	initial: 'general',
	onChange: (name) => {
		for (const entry of [...layers.stack]) layers.close(entry.layer, false);
		if (name === 'selector') requestAnimationFrame(() => openScope('selector'));
	},
});

for (const close of document.querySelectorAll('[data-mobile-close]')) {
	close.addEventListener('click', () => {
		const layer = document.querySelector('.preview-mobile-scope');
		if (layer instanceof HTMLElement) layers.close(layer);
	});
}
document.querySelector('[data-retry]')?.addEventListener('click', () => states.show('loading', true));
document.addEventListener('keydown', (event) => {
	if (event.key !== 'Escape' || layers.stack.length > 0) return;
	const active = document.querySelector('.preview-root > [data-state]:not([hidden])');
	if (active instanceof HTMLElement) active.querySelector('button')?.focus();
});

installDialogFocusTrap();
installNoOverflowSignal();
