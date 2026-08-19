import { expect, test } from "@playwright/test";
import { closeOverlays, obsidianPage } from "./harness/app";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");

test("wraps preset copy instead of clipping it mid word", async () => {
	const page = await obsidianPage();
	await closeOverlays(page);
	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:create-with-setup"));
	await page.waitForSelector(".table-cards-setup");
	await page.getByText("Add file", { exact: false }).first().click();
	await page.getByText("Vocab.md", { exact: false }).first().click();
	await page.locator(".table-cards-setup button", { hasText: "Continue" }).first().click();
	await page.waitForSelector(".tc-setup-preset");

	const copy = await page.evaluate(() => {
		const nodes = Array.from(document.querySelectorAll(".tc-setup-preset-reasons"));
		return nodes.map((node) => ({
			whiteSpace: getComputedStyle(node).whiteSpace,
			clipped: node.scrollWidth > Math.ceil(node.getBoundingClientRect().width) + 1,
		}));
	});

	expect(copy.length).toBeGreaterThan(0);
	for (const entry of copy) {
		expect(entry.whiteSpace).not.toBe("nowrap");
		expect(entry.clipped).toBe(false);
	}

	await closeOverlays(page);
});
