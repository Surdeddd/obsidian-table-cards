import { expect, test, type Page } from "@playwright/test";
import { closeOverlays, ensureDeck, obsidianPage, openEditor } from "./harness/app";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");

async function useEveryTable(page: Page): Promise<void> {
	await closeOverlays(page);
	await ensureDeck(page);
	await page.evaluate(() => {
		const plugin = window.app.plugins.plugins["table-cards"] as unknown as {
			updateSettings(mutate: (settings: unknown) => unknown): Promise<void>;
		};
		return plugin.updateSettings((settings) => {
			const typed = settings as {
				decks: Array<{
					name: string;
					sources: Array<{ tables: { mode: string; selectors?: unknown[] } }>;
					tableLayouts?: unknown[];
				}>;
			};
			const deck = typed.decks.find((item) => item.name === "Vocab") ?? typed.decks[0];
			if (!deck) return typed;
			for (const source of deck.sources) source.tables = { mode: "all" };
			deck.tableLayouts = [];
			return typed;
		});
	});
}

async function scopeOptions(page: Page): Promise<string[]> {
	await page.click(".tc-editor-scope-bar button.tc-listbox-trigger");
	await page.waitForSelector(".tc-listbox-options");
	const labels = await page.$$eval(".tc-listbox-options button.tc-listbox-option span:first-child", (spans) =>
		spans.map((span) => span.textContent ?? ""),
	);
	await page.keyboard.press("Escape");
	return labels;
}

async function pickScope(page: Page, label: string): Promise<void> {
	await page.click(".tc-editor-scope-bar button.tc-listbox-trigger");
	await page.waitForSelector(".tc-listbox-options");
	await page.locator(".tc-listbox-options button.tc-listbox-option", { hasText: label }).first().click();
	await page.waitForTimeout(500);
}

async function canvasLabels(page: Page): Promise<string[]> {
	return page.$$eval(".tc-editor-canvas-wrap .table-cards-box", (boxes) =>
		boxes.map((box) => `${box.getAttribute("data-kind") ?? ""}:${box.textContent?.trim().slice(0, 30) ?? ""}`),
	);
}

async function storedLayouts(page: Page): Promise<{ tableKey: string; blocks: number }[]> {
	return page.evaluate(() => {
		const plugin = window.app.plugins.plugins["table-cards"];
		const decks = (plugin?.settings["decks"] ?? []) as Array<{
			name: string;
			tableLayouts?: Array<{ tableKey: string; blocks: unknown[] }>;
		}>;
		const deck = decks.find((item) => item.name === "Vocab") ?? decks[0];
		return (deck?.tableLayouts ?? []).map((layout) => ({
			tableKey: layout.tableKey,
			blocks: layout.blocks.length,
		}));
	});
}

test("a deck with two tables offers a layout for each of them", async () => {
	const page = await obsidianPage();
	await useEveryTable(page);
	await openEditor(page);

	await page.waitForSelector(".tc-editor-scope-bar");
	const labels = await scopeOptions(page);

	expect(labels[0]).toBe("All tables");
	expect(labels.length).toBeGreaterThanOrEqual(3);
	expect(labels.some((label) => label.includes("Phrases"))).toBe(true);

	await closeOverlays(page);
});

test("giving one table its own layout leaves the other table alone", async () => {
	const page = await obsidianPage();
	await useEveryTable(page);
	await openEditor(page);
	await page.waitForSelector(".tc-editor-scope-bar");

	const deckLayout = await canvasLabels(page);
	expect(deckLayout.length).toBeGreaterThan(0);

	await pickScope(page, "Phrases");
	await page.locator(".tc-editor-scope-bar button.is-scope-toggle").click();
	await page.waitForTimeout(600);

	const ownLayout = await canvasLabels(page);
	expect(ownLayout).not.toEqual(deckLayout);

	await page.locator("button.tc-editor-save").click();
	await page.waitForTimeout(900);

	const saved = await storedLayouts(page);
	expect(saved).toHaveLength(1);
	expect(saved[0]?.blocks).toBeGreaterThan(0);

	await pickScope(page, "All tables");
	expect(await canvasLabels(page)).toEqual(deckLayout);

	await closeOverlays(page);
});

test("a table returns to the deck layout when its own one is dropped", async () => {
	const page = await obsidianPage();
	await useEveryTable(page);
	await openEditor(page);
	await page.waitForSelector(".tc-editor-scope-bar");

	await pickScope(page, "Phrases");
	const toggle = page.locator(".tc-editor-scope-bar button.is-scope-toggle");
	expect(await toggle.getAttribute("aria-pressed")).toBe("false");

	await toggle.click();
	await page.waitForTimeout(600);
	expect(await page.locator(".tc-editor-scope-bar button.is-scope-toggle").getAttribute("aria-pressed"))
		.toBe("true");
	await page.locator("button.tc-editor-save").click();
	await page.waitForTimeout(900);
	expect(await storedLayouts(page)).toHaveLength(1);

	await page.locator(".tc-editor-scope-bar button.is-scope-toggle").click();
	await page.waitForTimeout(600);
	expect(await page.locator(".tc-editor-scope-bar button.is-scope-toggle").getAttribute("aria-pressed"))
		.toBe("false");

	await page.locator("button.tc-editor-save").click();
	await page.waitForTimeout(900);

	expect(await storedLayouts(page)).toHaveLength(0);

	await closeOverlays(page);
});
