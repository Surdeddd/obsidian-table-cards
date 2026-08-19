import { expect, test } from "@playwright/test";
import { closeOverlays, ensureDeck, obsidianPage, openEditor } from "./harness/app";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");

interface LayerState {
	modals: number;
	popover: boolean;
	search: boolean;
	sheet: boolean;
}

async function layers(page: import("@playwright/test").Page): Promise<LayerState> {
	return page.evaluate(() => ({
		modals: document.querySelectorAll(".modal-container").length,
		popover: Boolean(document.querySelector(".tc-listbox-popover")),
		search: Boolean(document.querySelector(".tc-card-browser")),
		sheet: Boolean(document.querySelector(".tc-sheet-layer:not([hidden])")),
	}));
}

test.beforeEach(async () => {
	const page = await obsidianPage();
	await closeOverlays(page);
	await ensureDeck(page);
});

test("escape closes an open listbox without closing the launcher", async () => {
	const page = await obsidianPage();
	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:open"));
	await page.waitForSelector(".tc-launcher-start");
	await page.locator(".tc-launcher-deck button.tc-listbox-trigger").first().click();
	await page.waitForSelector(".tc-listbox-popover");

	await page.keyboard.press("Escape");
	await page.waitForTimeout(400);

	const state = await layers(page);
	expect(state.popover).toBe(false);
	expect(state.modals).toBe(1);

	await closeOverlays(page);
});

test("escape closes the card search without closing the session", async () => {
	const page = await obsidianPage();
	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:open"));
	await page.waitForSelector(".tc-launcher-start");
	await page.locator(".tc-launcher-start").click();
	await page.waitForSelector(".table-cards-stage");
	await page.locator("button.table-cards-search-btn").first().click();
	await page.waitForSelector(".tc-card-browser");

	await page.keyboard.press("Escape");
	await page.waitForTimeout(400);

	const state = await layers(page);
	expect(state.search).toBe(false);
	expect(state.modals).toBe(1);

	await closeOverlays(page);
});

test("escape closes an editor panel without closing the editor", async () => {
	const page = await obsidianPage();
	await openEditor(page);
	await page.evaluate(() => {
		document.querySelector<HTMLElement>(".tc-editor-canvas-wrap .table-cards-box")?.click();
	});
	await page.locator(".is-block-more").click();
	await page.waitForSelector(".tc-sheet-layer:not([hidden])");

	await page.keyboard.press("Escape");
	await page.waitForTimeout(400);

	const state = await layers(page);
	expect(state.sheet).toBe(false);
	expect(state.modals).toBe(1);

	await closeOverlays(page);
});
