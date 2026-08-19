import { expect, test } from "@playwright/test";
import { closeOverlays, ensureDeck, obsidianPage } from "./harness/app";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");

test("labels both navigation buttons in the study footer", async () => {
	const page = await obsidianPage();
	await closeOverlays(page);
	await ensureDeck(page);
	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:open"));
	await page.click(".tc-launcher-start");
	await page.waitForSelector(".table-cards-nav-next");

	const labels = await page.evaluate(() => {
		const read = (selector: string): string =>
			(document.querySelector(selector)?.textContent ?? "").trim();
		return {
			previous: read(".table-cards-nav-btn:not(.table-cards-nav-next)"),
			next: read(".table-cards-nav-next"),
		};
	});

	expect(labels.previous.length).toBeGreaterThan(0);
	expect(labels.next.length).toBeGreaterThan(0);

	await closeOverlays(page);
});
