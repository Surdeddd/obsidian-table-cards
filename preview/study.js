import {
	installDialogFocusTrap,
	installNoOverflowSignal,
	layerController,
	setPressed,
} from './preview.js';

/** @param {string} selector */
function requiredElement(selector) {
	const element = document.querySelector(selector);
	if (!(element instanceof HTMLElement)) throw new Error(`Study fixture is missing: ${selector}`);
	return element;
}

/** @param {string} selector */
function requiredButton(selector) {
	const element = document.querySelector(selector);
	if (!(element instanceof HTMLButtonElement)) throw new Error(`Study button is missing: ${selector}`);
	return element;
}

const params = new URLSearchParams(location.search);
const toolbarButtons = Array.from(document.querySelectorAll('.preview-toolbar [data-state]'))
	.filter((button) => button instanceof HTMLElement);
const launcher = requiredElement('[data-view="launcher"]');
const study = requiredElement('[data-view="study"]');
const modal = requiredElement('.preview-study-modal');
const counter = requiredElement('.table-cards-counter');
const progress = requiredElement('.table-cards-progress');
const progressBar = requiredElement('.table-cards-progress-bar');
const shuffle = requiredButton('[data-shuffle]');

const layers = layerController();
const cards = Array.from(document.querySelectorAll('[data-card]'))
	.filter((card) => card instanceof HTMLElement);
const knownStates = new Set(['launcher', 'normal', 'long', 'empty', 'image', 'browser', 'rtl']);
let currentState = 'launcher';
let index = 18;

/** @param {number} value */
function arabicDigits(value) {
	return String(value).replace(/[0-9]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)] ?? digit);
}

/** @param {boolean} rtl */
function updateLocalization(rtl) {
	for (const node of modal.querySelectorAll('[data-localize]')) {
		if (!(node instanceof HTMLElement)) continue;
		node.textContent = rtl ? node.dataset.ar ?? '' : node.dataset.en ?? '';
	}
	for (const node of modal.querySelectorAll('[data-aria-en]')) {
		if (!(node instanceof HTMLElement)) continue;
		node.setAttribute('aria-label', rtl ? node.dataset.ariaAr ?? '' : node.dataset.ariaEn ?? '');
	}
	for (const input of modal.querySelectorAll('[data-placeholder-en]')) {
		if (!(input instanceof HTMLInputElement)) continue;
		input.placeholder = rtl ? input.dataset.placeholderAr ?? '' : input.dataset.placeholderEn ?? '';
	}
}

function updateCounter() {
	const rtl = currentState === 'rtl';
	counter.textContent = rtl ? `${arabicDigits(index)} / ${arabicDigits(583)}` : `${index} / 583`;
	counter.setAttribute('aria-label', rtl ? 'التقدم' : 'Progress');
	progress.setAttribute('aria-valuenow', String(index));
	progress.setAttribute('aria-valuetext', rtl ? `${arabicDigits(index)} من ${arabicDigits(583)}` : `${index} of 583`);
	progressBar.style.width = `${(index / 583) * 100}%`;
}

/** @param {string} name @param {HTMLElement | null} opener */
function openLayer(name, opener) {
	const layer = document.querySelector(`[data-layer="${name}"]`);
	if (layer instanceof HTMLElement && layer.hidden) layers.open(layer, opener, 'input, button');
}

/** @param {string | undefined} requested */
function show(requested) {
	const state = requested && knownStates.has(requested) ? requested : 'launcher';
	currentState = state;
	setPressed(toolbarButtons, toolbarButtons.find((button) => button.dataset.state === state));
	const inStudy = state !== 'launcher';
	launcher.hidden = inStudy;
	study.hidden = !inStudy;
	const cardState = ['long', 'empty', 'image', 'rtl'].includes(state) ? state : 'normal';
	for (const card of cards) card.hidden = card.dataset.card !== cardState;
	const rtl = state === 'rtl';
	modal.classList.toggle('is-rtl', rtl);
	modal.dir = rtl ? 'rtl' : 'ltr';
	modal.lang = rtl ? 'ar' : 'en';
	updateLocalization(rtl);
	updateCounter();
	if (state === 'browser') requestAnimationFrame(() => {
		const opener = document.querySelector('[data-open-browser]');
		openLayer('browser', opener instanceof HTMLElement ? opener : null);
	});
}

for (const button of toolbarButtons) button.addEventListener('click', () => show(button.dataset.state));
document.querySelector('[data-start-study]')?.addEventListener('click', () => show('normal'));
document.querySelector('[data-open-scope]')?.addEventListener('click', (event) => {
	openLayer('scope', event.currentTarget instanceof HTMLElement ? event.currentTarget : null);
});
document.querySelector('[data-open-browser]')?.addEventListener('click', (event) => {
	openLayer('browser', event.currentTarget instanceof HTMLElement ? event.currentTarget : null);
});
document.querySelector('[data-open-lightbox]')?.addEventListener('click', (event) => {
	const opener = event.currentTarget;
	const source = opener instanceof HTMLElement ? opener.querySelector('img') : null;
	const target = document.querySelector('[data-lightbox-image]');
	if (source instanceof HTMLImageElement && target instanceof HTMLImageElement) {
		target.src = source.src;
		target.alt = source.alt;
	}
	openLayer('lightbox', opener instanceof HTMLElement ? opener : null);
});
for (const close of document.querySelectorAll('[data-close-layer]')) {
	if (!(close instanceof HTMLElement)) continue;
	close.addEventListener('click', () => {
		const layer = document.querySelector(`[data-layer="${close.dataset.closeLayer ?? ''}"]`);
		if (layer instanceof HTMLElement) layers.close(layer);
	});
}

document.querySelector('[data-exact-result]')?.addEventListener('click', (event) => {
	const result = event.currentTarget;
	const normal = document.querySelector('[data-card="normal"]');
	if (!(result instanceof HTMLElement) || !(normal instanceof HTMLElement)) return;
	const word = normal.querySelector('.table-cards-word');
	const table = normal.querySelector('.table-cards-source-table');
	const file = normal.querySelector('.table-cards-source-file');
	if (word) word.textContent = result.dataset.word ?? '';
	if (table) table.textContent = result.dataset.table ?? '';
	if (file) file.textContent = result.dataset.file ?? '';
	index = Number(result.dataset.index ?? 1);
	const browser = document.querySelector('[data-layer="browser"]');
	if (browser instanceof HTMLElement) layers.close(browser);
	show('normal');
	normal.scrollTop = 0;
});

/** @param {number} delta */
function step(delta) {
	index = Math.max(1, Math.min(583, index + delta));
	updateCounter();
}
document.querySelector('[data-prev]')?.addEventListener('click', () => step(-1));
document.querySelector('[data-next]')?.addEventListener('click', () => step(1));
shuffle.addEventListener('click', () => {
	const active = shuffle.getAttribute('aria-pressed') === 'true';
	shuffle.setAttribute('aria-pressed', String(!active));
	shuffle.classList.toggle('is-active', !active);
});
document.addEventListener('keydown', (event) => {
	if (layers.stack.length > 0) return;
	if (event.key === 'ArrowRight') step(1);
	if (event.key === 'ArrowLeft') step(-1);
	if (event.key.toLowerCase() === 's' && !event.metaKey && !event.ctrlKey) shuffle.click();
});

/** @type {{ x: number, y: number } | null} */
let pointerStart = null;
modal.addEventListener('pointerdown', (event) => {
	pointerStart = { x: event.clientX, y: event.clientY };
});
modal.addEventListener('pointerup', (event) => {
	if (!pointerStart) return;
	const dx = event.clientX - pointerStart.x;
	const dy = event.clientY - pointerStart.y;
	if (Math.abs(dx) > 52 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
	pointerStart = null;
});

show(params.get('state') ?? 'launcher');
installDialogFocusTrap();
installNoOverflowSignal();
