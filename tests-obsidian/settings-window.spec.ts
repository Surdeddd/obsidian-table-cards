import { chromium, expect, test, type Page } from "@playwright/test";
import { CDP_URL, closeOverlays, ensureDeck, obsidianPage } from "./harness/app";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");

async function settingsPage(): Promise<Page | null> {
	const browser = await chromium.connectOverCDP(CDP_URL);
	const context = browser.contexts()[0];
	if (!context) return null;
	const titled = await Promise.all(
		context.pages().map(async (page) => ({ page, title: await page.title() })),
	);
	return titled.find((entry) => entry.title.startsWith("Settings"))?.page ?? null;
}

test("the settings tab controls work in Obsidian's separate settings window", async () => {
	const main = await obsidianPage();
	await closeOverlays(main);
	await ensureDeck(main);
	await main.evaluate(() => window.app.commands.executeCommandById("app:open-settings"));
	await main.waitForTimeout(2500);

	const settings = await settingsPage();
	test.skip(settings === null, "this Obsidian build renders settings in the main window");
	if (!settings) return;

	await settings.locator(".vertical-tab-nav-item", { hasText: "Table Cards" }).first().click();
	await settings.waitForSelector(".table-cards-settings");

	await settings.locator(".table-cards-settings button.tc-listbox-trigger").first().click();
	await settings.waitForSelector(".tc-listbox-popover");

	await settings.mouse.click(60, 700);
	await settings.waitForTimeout(500);

	const popovers = await settings.evaluate(() => document.querySelectorAll(".tc-listbox-popover").length);
	expect(popovers).toBe(0);

	await main.evaluate(() => window.app.setting?.close?.());
});
