import {
	installDialogFocusTrap,
	installNoOverflowSignal,
	setPressed,
	stateController,
} from './preview.js';

/** @param {string} selector */
function requiredElement(selector) {
	const element = document.querySelector(selector);
	if (!(element instanceof HTMLElement)) throw new Error(`Setup fixture is missing: ${selector}`);
	return element;
}

const controller = stateController({
	buttons: '.preview-toolbar [data-state]',
	panels: '.preview-root > [data-state]',
	initial: 'data',
});
for (const button of document.querySelectorAll('[data-next]')) {
	if (!(button instanceof HTMLElement)) continue;
	button.addEventListener('click', () => controller.show(button.dataset.next, true));
}
for (const button of document.querySelectorAll('[data-preset]')) {
	if (!(button instanceof HTMLElement)) continue;
	button.addEventListener('click', () => {
		setPressed(document.querySelectorAll('[data-preset]'), button);
		const title = document.querySelector('[data-preview-title]');
		if (title) title.textContent = button.dataset.previewWord ?? '';
	});
}
for (const button of document.querySelectorAll('[data-icon]')) {
	button.addEventListener('click', () => setPressed(document.querySelectorAll('[data-icon]'), button));
}

const rtlButton = requiredElement('[data-rtl]');
/** @param {boolean} rtl */
function applyRtl(rtl) {
	rtlButton.setAttribute('aria-pressed', String(rtl));
	for (const fixture of document.querySelectorAll('.table-cards-setup')) {
		if (!(fixture instanceof HTMLElement)) continue;
		fixture.dir = rtl ? 'rtl' : 'ltr';
		fixture.lang = rtl ? 'ar' : 'en';
		fixture.classList.toggle('preview-setup-rtl', rtl);
	}
	for (const node of document.querySelectorAll('.tc-setup-progress-label, .tc-setup-source-summary, .tc-setup-status-summary, .tc-setup-warning-count, .tc-setup-final-summary')) {
		if (!(node instanceof HTMLElement)) continue;
		node.dataset.ltrCopy ||= node.textContent ?? '';
		node.textContent = rtl
			? node.dataset.ltrCopy.replace(/[0-9]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)] ?? digit)
			: node.dataset.ltrCopy;
	}
}
rtlButton.addEventListener('click', () => applyRtl(rtlButton.getAttribute('aria-pressed') !== 'true'));
applyRtl(new URLSearchParams(location.search).get('rtl') === '1');

document.querySelector('[data-create-deck]')?.addEventListener('click', () => {
	const input = document.querySelector('.tc-setup-field input');
	const status = document.querySelector('[data-created]');
	if (!(input instanceof HTMLInputElement) || !(status instanceof HTMLElement)) return;
	status.hidden = false;
	status.textContent = `Deck created: ${input.value.trim() || 'Untitled deck'}`;
	status.focus();
});
document.addEventListener('keydown', (event) => {
	if (event.key !== 'Escape') return;
	event.preventDefault();
	const close = document.querySelector('.preview-root > [data-state]:not([hidden]) .tc-setup-close');
	if (close instanceof HTMLElement) close.focus();
});

installDialogFocusTrap();
installNoOverflowSignal();
