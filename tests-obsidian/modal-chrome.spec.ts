import { expect, test } from "@playwright/test";
import { closeOverlays, ensureDeck, obsidianPage, openEditor } from "./harness/app";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");

async function hostCloseButtons(page: import("@playwright/test").Page): Promise<number> {
	return page.evaluate(() => {
		const modal = document.querySelector(".modal-container .modal");
		if (!modal) throw new Error("no plugin modal open");
		return Array.from(modal.children).filter((child) => {
			const box = child.getBoundingClientRect();
			const style = getComputedStyle(child);
			const isHostChrome =
				child.classList.contains("modal-close-button") || child.classList.contains("modal-header-button");
			return isHostChrome && style.display !== "none" && box.width > 0 && box.height > 0;
		}).length;
	});
}

test("the setup wizard shows only its own close control", async () => {
	const page = await obsidianPage();
	await closeOverlays(page);
	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:create-with-setup"));
	await page.waitForSelector(".table-cards-setup");

	expect(await hostCloseButtons(page)).toBe(0);
	expect(await page.locator(".table-cards-setup button.tc-setup-close").count()).toBe(1);

	await closeOverlays(page);
});

test("the study session shows only its own close control", async () => {
	const page = await obsidianPage();
	await closeOverlays(page);
	await ensureDeck(page);
	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:open"));
	await page.waitForSelector(".table-cards-stage", { timeout: 15_000 });

	expect(await hostCloseButtons(page)).toBe(0);

	await closeOverlays(page);
});

test("the editor shows only its own close control", async () => {
	const page = await obsidianPage();
	await openEditor(page);

	expect(await hostCloseButtons(page)).toBe(0);

	await closeOverlays(page);
});
