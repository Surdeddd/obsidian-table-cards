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

test("escape closes an open listbox without closing the picker", async () => {
	const page = await obsidianPage();
	await page.evaluate(async () => {
		const plugin = window.app.plugins.plugins["table-cards"] as unknown as {
			settings: { decks: unknown[]; lastDeckId: string | null };
			updateSettings(mutate: (settings: unknown) => unknown): Promise<void>;
		};
		await plugin.updateSettings((settings) => {
			const typed = settings as { decks: Record<string, unknown>[]; lastDeckId: string | null };
			if (typed.decks.length === 1 && typed.decks[0]) {
				typed.decks.push({ ...typed.decks[0], id: "deck-picker-fixture", name: "Second deck" });
			}
			typed.lastDeckId = null;
			return typed;
		});
	});
	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:open"));
	await page.waitForSelector(".tc-launcher-start", { timeout: 15_000 });
	await page.locator(".tc-launcher-deck button.tc-listbox-trigger").first().click();
	await page.waitForSelector(".tc-listbox-popover");

	await page.keyboard.press("Escape");
	await page.waitForTimeout(400);

	const state = await layers(page);
	expect(state.popover).toBe(false);
	expect(state.modals).toBe(1);

	await closeOverlays(page);
	await page.evaluate(async () => {
		const plugin = window.app.plugins.plugins["table-cards"] as unknown as {
			updateSettings(mutate: (settings: unknown) => unknown): Promise<void>;
		};
		await plugin.updateSettings((settings) => {
			const typed = settings as { decks: { id: string }[]; lastDeckId: string | null };
			typed.decks = typed.decks.filter((deck) => deck.id !== "deck-picker-fixture");
			typed.lastDeckId = typed.decks[0]?.id ?? null;
			return typed;
		});
	});
});

test("escape closes the card search without closing the session", async () => {
	const page = await obsidianPage();
	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:open"));
	await page.waitForSelector(".table-cards-stage", { timeout: 15_000 });
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
