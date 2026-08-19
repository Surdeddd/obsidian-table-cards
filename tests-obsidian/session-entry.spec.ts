import { expect, test } from "@playwright/test";
import { closeOverlays, ensureDeck, obsidianPage } from "./harness/app";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");

test("opens the configured deck straight into the cards", async () => {
	const page = await obsidianPage();
	await closeOverlays(page);
	await ensureDeck(page);

	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:open"));
	await page.waitForSelector(".table-cards-stage", { timeout: 15_000 });

	const state = await page.evaluate(() => ({
		stage: Boolean(document.querySelector(".table-cards-stage")),
		picker: Boolean(document.querySelector(".tc-launcher-start")),
		card: (document.querySelector(".table-cards-box")?.textContent ?? "").trim().length,
	}));

	expect(state.stage).toBe(true);
	expect(state.picker).toBe(false);
	expect(state.card).toBeGreaterThan(0);

	await closeOverlays(page);
});
