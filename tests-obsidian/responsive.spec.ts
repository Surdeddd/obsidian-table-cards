import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { closeOverlays, ensureDeck, obsidianPage, openEditor } from "./harness/app";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");

interface Device {
	name: string;
	width: number;
	height: number;
}

const DEVICES: Device[] = [
	{ name: "desktop", width: 1440, height: 900 },
	{ name: "laptop", width: 1280, height: 800 },
	{ name: "narrow-window", width: 900, height: 700 },
	{ name: "tablet-portrait", width: 820, height: 1180 },
	{ name: "tablet-landscape", width: 1180, height: 820 },
	{ name: "phone-portrait", width: 390, height: 844 },
	{ name: "phone-landscape", width: 844, height: 390 },
	{ name: "phone-small", width: 320, height: 568 },
];

const CHROME = [
	".table-cards-header",
	".table-cards-footer",
	".tc-launcher-header",
	".tc-launcher-footer",
	".tc-setup-header",
	".tc-setup-footer",
	".tc-editor-header",
	".tc-editor-canvas-bar",
	".tc-editor-scope-bar",
	".tc-editor-block-toolbar",
	".tc-sheet-header",
	".tc-sheet-footer",
];

const SCROLLERS = [
	".tc-sheet-body",
	".tc-editor-canvas-wrap",
	".table-cards-stage",
	".tc-launcher-body",
	".tc-setup-body",
];

const SHOTS = "artifacts/responsive";

interface Box {
	selector: string;
	left: number;
	top: number;
	right: number;
	bottom: number;
	height: number;
}

interface Scroller {
	selector: string;
	scrollWidth: number;
	clientWidth: number;
}

interface Surface {
	documentScroll: number;
	viewport: number;
	modal: Box;
	chrome: Box[];
	scrollers: Scroller[];
	shortestControl: { selector: string; height: number } | null;
}

async function measure(page: Page, modalSelector: string, chrome: string[], scrollers: string[]): Promise<Surface> {
	return page.evaluate((input: { selector: string; chromeSelectors: string[]; scrollerSelectors: string[] }) => {
		const { selector, chromeSelectors, scrollerSelectors } = input;
		const modal = document.querySelector<HTMLElement>(selector);
		if (!modal) throw new Error(`missing ${selector}`);
		const boxOf = (element: HTMLElement, name: string) => {
			const rect = element.getBoundingClientRect();
			return {
				selector: name,
				left: Math.round(rect.left),
				top: Math.round(rect.top),
				right: Math.round(rect.right),
				bottom: Math.round(rect.bottom),
				height: Math.round(rect.height),
			};
		};
		const visible = (element: HTMLElement) => element.getClientRects().length > 0;
		const chromeBoxes = chromeSelectors.flatMap((name) =>
			Array.from(modal.querySelectorAll<HTMLElement>(name))
				.filter(visible)
				.map((element) => boxOf(element, name)),
		);
		const scrollerSizes = scrollerSelectors.flatMap((name) =>
			Array.from(modal.querySelectorAll<HTMLElement>(name))
				.filter(visible)
				.map((element) => ({
					selector: name,
					scrollWidth: element.scrollWidth,
					clientWidth: element.clientWidth,
				})),
		);
		let shortestControl: { selector: string; height: number } | null = null;
		for (const name of chromeSelectors) {
			for (const bar of Array.from(modal.querySelectorAll<HTMLElement>(name))) {
				for (const control of Array.from(bar.querySelectorAll<HTMLElement>("button"))) {
					if (!visible(control)) continue;
					const height = Math.round(control.getBoundingClientRect().height);
					if (!shortestControl || height < shortestControl.height) {
						shortestControl = { selector: `${name} button`, height };
					}
				}
			}
		}
		return {
			documentScroll: document.documentElement.scrollWidth,
			viewport: window.innerWidth,
			modal: boxOf(modal, selector),
			chrome: chromeBoxes,
			scrollers: scrollerSizes,
			shortestControl,
		};
	}, { selector: modalSelector, chromeSelectors: chrome, scrollerSelectors: scrollers });
}

function expectFits(device: Device, surfaceName: string, surface: Surface): void {
	const label = `${device.name} · ${surfaceName}`;
	expect(surface.documentScroll, `${label} scrolls the page horizontally`)
		.toBeLessThanOrEqual(surface.viewport + 1);
	expect(surface.modal.right, `${label} modal past the right edge`).toBeLessThanOrEqual(device.width + 1);
	expect(surface.modal.bottom, `${label} modal past the bottom edge`).toBeLessThanOrEqual(device.height + 1);
	expect(surface.modal.left, `${label} modal past the left edge`).toBeGreaterThanOrEqual(-1);
	expect(surface.modal.top, `${label} modal above the top edge`).toBeGreaterThanOrEqual(-1);

	for (const box of surface.chrome) {
		expect(box.right, `${label} ${box.selector} past the right edge`).toBeLessThanOrEqual(device.width + 1);
		expect(box.left, `${label} ${box.selector} past the left edge`).toBeGreaterThanOrEqual(-1);
		expect(box.bottom, `${label} ${box.selector} past the bottom edge`).toBeLessThanOrEqual(device.height + 1);
		expect(box.top, `${label} ${box.selector} above the top edge`).toBeGreaterThanOrEqual(-1);
		expect(box.height, `${label} ${box.selector} collapsed`).toBeGreaterThan(0);
	}

	for (const scroller of surface.scrollers) {
		expect(scroller.scrollWidth, `${label} ${scroller.selector} scrolls horizontally`)
			.toBeLessThanOrEqual(scroller.clientWidth + 1);
	}

	if (surface.shortestControl) {
		expect(surface.shortestControl.height, `${label} ${surface.shortestControl.selector} too small to hit`)
			.toBeGreaterThanOrEqual(24);
	}
}

async function overlappingBlocks(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const stage = document.querySelector<HTMLElement>(".table-cards-stage");
		if (!stage) return [];
		const boxes = Array.from(stage.querySelectorAll<HTMLElement>(":scope > .table-cards-box"))
			.filter((box) => box.getClientRects().length > 0)
			.map((box) => ({ rect: box.getBoundingClientRect(), kind: box.dataset.kind ?? "block" }));
		const clashes: string[] = [];
		for (let left = 0; left < boxes.length; left += 1) {
			for (let right = left + 1; right < boxes.length; right += 1) {
				const a = boxes[left]!;
				const b = boxes[right]!;
				const horizontal = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
				const vertical = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
				if (horizontal > 1 && vertical > 1) clashes.push(`${a.kind}/${b.kind}`);
			}
		}
		return clashes;
	});
}

async function escapingContent(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const stage = document.querySelector<HTMLElement>(".table-cards-stage");
		if (!stage) return [];
		const escaped: string[] = [];
		for (const box of Array.from(stage.querySelectorAll<HTMLElement>(":scope > .table-cards-box"))) {
			if (box.getClientRects().length === 0) continue;
			if (getComputedStyle(box).overflow !== "visible") continue;
			const bounds = box.getBoundingClientRect();
			for (const child of Array.from(box.children)) {
				const rect = child.getBoundingClientRect();
				if (rect.height === 0) continue;
				if (rect.bottom > bounds.bottom + 1) {
					escaped.push(`${box.dataset.kind ?? "block"} → ${Math.round(rect.bottom - bounds.bottom)}px`);
				}
			}
		}
		return escaped;
	});
}

async function shoot(page: Page, name: string): Promise<void> {
	mkdirSync(SHOTS, { recursive: true });
	await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test.describe("responsive surfaces", () => {
	test.describe.configure({ timeout: 240_000 });

	for (const device of DEVICES) {
		test(`fits the ${device.name} viewport`, async () => {
			const page = await obsidianPage();
			await closeOverlays(page);
			await page.setViewportSize({ width: device.width, height: device.height });
			await page.waitForTimeout(300);

			await ensureDeck(page);
			await page.evaluate(() => window.app.commands.executeCommandById("table-cards:open"));
			await page.waitForSelector(".table-cards-modal");
			await page.waitForTimeout(500);
			expectFits(device, "session", await measure(page, ".table-cards-modal", CHROME, SCROLLERS));
			expect(await overlappingBlocks(page), `${device.name} session blocks overlap`).toEqual([]);
			expect(await escapingContent(page), `${device.name} session content leaves its block`).toEqual([]);
			await shoot(page, `${device.name}-session`);

			const start = page.locator("button.tc-launcher-start");
			if ((await start.count()) > 0 && (await start.first().isEnabled())) {
				await start.first().click();
				await page.waitForSelector(".table-cards-stage");
				await page.waitForTimeout(500);
				expectFits(device, "study", await measure(page, ".table-cards-modal", CHROME, SCROLLERS));
				await shoot(page, `${device.name}-study`);
			}
			await closeOverlays(page);

			await openEditor(page);
			await page.waitForTimeout(500);
			expectFits(device, "editor", await measure(page, ".table-cards-editor", CHROME, SCROLLERS));
			expect(await overlappingBlocks(page), `${device.name} editor blocks overlap`).toEqual([]);
			await shoot(page, `${device.name}-editor`);

			await page.evaluate(() => {
				document.querySelector<HTMLElement>(".tc-editor-canvas-bar button.tc-editor-button")?.click();
			});
			await page.waitForSelector(".tc-sheet");
			await page.waitForTimeout(500);
			expectFits(device, "editor sheet", await measure(page, ".table-cards-editor", CHROME, SCROLLERS));
			await shoot(page, `${device.name}-editor-sheet`);

			const room = await page.evaluate(() => {
				const shell = document.querySelector<HTMLElement>(".tc-editor-shell");
				const sheet = document.querySelector<HTMLElement>(".tc-sheet");
				const card = document.querySelector<HTMLElement>(".tc-editor-preview");
				if (!shell || !sheet) throw new Error("editor sheet missing");
				return {
					shellWidth: shell.getBoundingClientRect().width,
					shellHeight: shell.getBoundingClientRect().height,
					sheetWidth: sheet.getBoundingClientRect().width,
					sheetHeight: sheet.getBoundingClientRect().height,
					cardHeight: card ? card.getBoundingClientRect().height : 0,
				};
			});

			if (room.sheetWidth >= room.shellWidth - 2) {
				expect(room.sheetHeight, `${device.name} full width sheet covers the whole shell`)
					.toBeLessThanOrEqual(room.shellHeight * 0.9);
			} else {
				expect(room.sheetWidth, `${device.name} sheet leaves no canvas`)
					.toBeLessThanOrEqual(room.shellWidth * 0.75);
			}
			expect(room.cardHeight, `${device.name} card preview disappeared`).toBeGreaterThan(0);

			await closeOverlays(page);
			await page.setViewportSize({ width: 1440, height: 900 });
		});
	}
});
