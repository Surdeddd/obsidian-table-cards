import { expect, test } from "@playwright/test";
import { closeOverlays, obsidianPage } from "./harness/app";
import { RIBBON_ICONS } from "../src/model";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");

test("every curated ribbon icon draws on the supported app floor", async () => {
	test.setTimeout(180_000);
	const page = await obsidianPage();
	await closeOverlays(page);

	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:create-with-setup"));
	await page.waitForSelector(".table-cards-setup");
	await page.getByText("Add file", { exact: false }).first().click();
	await page.getByText("Vocab.md", { exact: true }).first().click();
	await page.waitForTimeout(600);
	for (let step = 0; step < 2; step += 1) {
		await page.locator(".table-cards-setup button", { hasText: "Continue" }).first().click();
		await page.waitForTimeout(700);
	}
	await page.waitForSelector(".tc-setup-icons");

	const drawn = await page.$$eval(".tc-setup-icons button", (buttons) =>
		buttons.map((button) => button.querySelector("svg") !== null),
	);

	expect(drawn, "the picker must offer exactly the curated icons").toHaveLength(RIBBON_ICONS.length);
	const blank = RIBBON_ICONS.filter((_, index) => drawn[index] === false);
	expect(blank, "a ribbon icon that draws nothing leaves the user with a blank button").toEqual([]);

	await closeOverlays(page);
});

test("every preset card draws its own icon", async () => {
	test.setTimeout(180_000);
	const page = await obsidianPage();
	await closeOverlays(page);

	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:create-with-setup"));
	await page.waitForSelector(".table-cards-setup");
	await page.getByText("Add file", { exact: false }).first().click();
	await page.getByText("Vocab.md", { exact: true }).first().click();
	await page.waitForTimeout(600);
	await page.locator(".table-cards-setup button", { hasText: "Continue" }).first().click();
	await page.waitForSelector(".tc-setup-presets");
	await page.waitForTimeout(500);

	const blank = await page.$$eval(".tc-setup-presets button", (cards) =>
		cards
			.filter((card) => card.querySelector(".tc-setup-preset-icon svg") === null)
			.map((card) => card.querySelector(".tc-setup-preset-name")?.textContent?.trim() ?? "?"),
	);

	expect(blank, "a preset with no icon looks unfinished next to the ones that have one").toEqual([]);

	await closeOverlays(page);
});
