import {
	installDialogFocusTrap,
	installNoOverflowSignal,
	layerController,
	placeAnchoredPopover,
	setPressed,
} from './preview.js';

/** @param {string} selector */
function requiredElement(selector) {
	const element = document.querySelector(selector);
	if (!(element instanceof HTMLElement)) throw new Error(`Editor fixture is missing: ${selector}`);
	return element;
}

const params = new URLSearchParams(location.search);
const panels = Array.from(document.querySelectorAll('[data-panel]'))
	.filter((panel) => panel instanceof HTMLElement);
const layers = layerController();
/** @type {HTMLElement | null} */
let panelOpener = null;

/** @param {string} name @param {HTMLElement | null} opener */
function showPanel(name, opener = null) {
	if (opener) panelOpener = opener;
	for (const panel of panels) panel.hidden = panel.dataset.panel !== name;
	const active = panels.find((panel) => !panel.hidden);
	if (active) requestAnimationFrame(() => {
		const close = active.querySelector('.tc-sheet-close');
		if (close instanceof HTMLElement) close.focus();
	});
	else if (panelOpener) requestAnimationFrame(() => panelOpener?.focus());
}
for (const button of document.querySelectorAll('[data-open]')) {
	if (!(button instanceof HTMLElement)) continue;
	button.addEventListener('click', () => showPanel(button.dataset.open ?? '', button));
}
for (const button of document.querySelectorAll('[data-close]')) {
	button.addEventListener('click', () => showPanel(''));
}

const fieldsList = requiredElement('.preview-fields-list');
const tableRoute = requiredElement('.preview-table-route');
/** @type {HTMLElement | null} */
let tableOpener = null;
/** @param {boolean} open @param {HTMLElement | null} opener */
function showTables(open, opener = null) {
	if (opener) tableOpener = opener;
	fieldsList.hidden = open;
	tableRoute.hidden = !open;
	requestAnimationFrame(() => {
		const target = open ? tableRoute.querySelector('.tc-table-selection-back') : tableOpener;
		if (target instanceof HTMLElement) target.focus();
	});
}
const chooseTables = document.querySelector('[data-choose-tables]');
chooseTables?.addEventListener('click', (event) => {
	showTables(true, event.currentTarget instanceof HTMLElement ? event.currentTarget : null);
});
document.querySelector('[data-back-sources]')?.addEventListener('click', () => showTables(false));
document.querySelector('[data-open-exact]')?.addEventListener('click', () => {
	const status = document.querySelector('.preview-opened-state');
	if (status instanceof HTMLElement) status.hidden = false;
});

const listboxTrigger = requiredElement('[data-demo-listbox]');
const listbox = requiredElement('[data-demo-options]');
listboxTrigger.addEventListener('click', () => {
	if (listbox.hidden) {
		layers.open(listbox, listboxTrigger, '[aria-selected="true"]');
		placeAnchoredPopover(listboxTrigger, listbox);
	} else layers.close(listbox);
});
for (const input of document.querySelectorAll('.tc-range-line input[type="range"]')) {
	if (!(input instanceof HTMLInputElement)) continue;
	const paint = () => {
		const min = Number(input.min || "0");
		const max = Number(input.max || "100");
		const value = Number(input.value);
		const pct = max <= min ? 0 : Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
		input.style.setProperty("--tc-range-pct", `${pct}%`);
		const output = input.parentElement?.querySelector("output");
		if (output) output.textContent = input.value;
	};
	input.addEventListener("input", paint);
	paint();
}
for (const option of listbox.querySelectorAll('[role="option"]')) {
	option.addEventListener('click', () => {
		for (const candidate of listbox.querySelectorAll('[role="option"]')) {
			candidate.setAttribute('aria-selected', String(candidate === option));
		}
		const value = listboxTrigger.querySelector('span');
		if (value) value.textContent = option.textContent;
		layers.close(listbox);
	});
}

const preview = requiredElement('.tc-editor-preview');
const phoneButton = requiredElement('[data-phone]');
const deviceButtons = Array.from(document.querySelectorAll('[data-device]'))
	.filter((button) => button instanceof HTMLElement);
/** @param {boolean} phone */
function setPhone(phone) {
	preview.classList.toggle('is-phone', phone);
	preview.classList.toggle('is-desktop', !phone);
	setPressed(deviceButtons, deviceButtons.find((button) => button.dataset.device === (phone ? 'phone' : 'desktop')));
	phoneButton.setAttribute('aria-pressed', String(phone));
}
for (const button of deviceButtons) {
	button.addEventListener('click', () => setPhone(button.dataset.device === 'phone'));
}
phoneButton.addEventListener('click', () => setPhone(phoneButton.getAttribute('aria-pressed') !== 'true'));

const expandedButton = requiredElement('[data-expanded]');
/** @param {boolean} expanded */
function setExpanded(expanded) {
	expandedButton.setAttribute('aria-pressed', String(expanded));
	for (const node of document.querySelectorAll('[data-copy-expanded]')) {
		if (!(node instanceof HTMLElement)) continue;
		node.textContent = expanded ? node.dataset.copyExpanded ?? '' : node.dataset.copyNormal ?? '';
	}
}
expandedButton.addEventListener('click', () => setExpanded(expandedButton.getAttribute('aria-pressed') !== 'true'));

for (const button of document.querySelectorAll('[data-open-preview]')) {
	if (!(button instanceof HTMLElement)) continue;
	button.addEventListener('click', () => {
		showPanel('fields', button);
		showTables(button.dataset.openPreview === 'tables', button);
	});
}
document.addEventListener('keydown', (event) => {
	if (event.key !== 'Escape' || layers.stack.length > 0) return;
	const active = panels.find((panel) => !panel.hidden);
	if (!active) return;
	event.preventDefault();
	if (!tableRoute.hidden) showTables(false);
	else showPanel('');
});

setPhone(params.get('device') === 'phone');
setExpanded(params.get('expanded') === '1');
showPanel(params.get('panel') ?? '');
if (params.get('route') === 'tables') {
	showPanel('fields');
	showTables(true, chooseTables instanceof HTMLElement ? chooseTables : null);
}
installDialogFocusTrap();
installNoOverflowSignal();
