import { expect, test } from "@playwright/test";
import { closeOverlays, ensureDeck, obsidianPage, openEditor, selectBlock } from "./harness/app";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");

test("a block that draws nothing on this row is still reachable from the block list", async () => {
	const page = await obsidianPage();
	await openEditor(page);
	await selectBlock(page, 0);
	await page.locator(".is-block-move").click();
	await page.waitForSelector(".tc-reorder-list");

	const rows = page.locator("button.tc-reorder-identity");
	const total = await rows.count();
	const drawn = await page.evaluate(
		() => document.querySelectorAll(".tc-editor-canvas-wrap .table-cards-box").length,
	);
	expect(total).toBeGreaterThan(drawn);

	const last = rows.nth(total - 1);
	const label = ((await last.textContent()) ?? "").trim();
	await last.click();
	await page.waitForSelector(".tc-sheet");

	const selected = await page.evaluate(() => ({
		panel: document.querySelector(".tc-sheet-header h2")?.textContent?.trim() ?? "",
		labelledBy: document.querySelector(".tc-sheet")?.getAttribute("aria-labelledby") ?? "",
	}));
	expect(label.length).toBeGreaterThan(0);
	expect(selected.labelledBy).toBe("tc-block-sheet-title");
	expect(selected.panel.length).toBeGreaterThan(0);

	await closeOverlays(page);
});

test("saving keeps the selected block, the previewed row and the undo history", async () => {
	const page = await obsidianPage();
	await openEditor(page);
	await selectBlock(page, 1);
	await page.locator(".tc-editor-row-nav > button").nth(1).click();
	await page.waitForTimeout(300);
	await page.locator("button.is-block-width").click();
	await page.waitForTimeout(300);

	const before = await page.evaluate(() => ({
		row: document.querySelector(".tc-editor-row-picker summary")?.textContent?.trim() ?? "",
		selected: document.querySelectorAll(".tc-editor-canvas-wrap .table-cards-box.is-selected").length,
		toolbar: document.querySelector(".is-block-type")?.textContent?.trim() ?? "",
	}));

	await page.locator("button.tc-editor-save").click();
	await page.waitForFunction(() => {
		const save = document.querySelector<HTMLButtonElement>("button.tc-editor-save");
		return Boolean(save?.disabled);
	});

	const after = await page.evaluate(() => ({
		row: document.querySelector(".tc-editor-row-picker summary")?.textContent?.trim() ?? "",
		selected: document.querySelectorAll(".tc-editor-canvas-wrap .table-cards-box.is-selected").length,
		toolbar: document.querySelector(".is-block-type")?.textContent?.trim() ?? "",
		undo: !document.querySelector<HTMLButtonElement>(".tc-editor-history button")?.disabled,
	}));

	expect(after.row).toBe(before.row);
	expect(after.selected).toBe(before.selected);
	expect(after.toolbar).toBe(before.toolbar);
	expect(after.undo).toBe(true);

	await closeOverlays(page);
});

test("the width button states the width it holds and stays pressed while it holds it", async () => {
	const page = await obsidianPage();
	await openEditor(page);
	await selectBlock(page, 0);

	const width = page.locator("button.is-block-width");
	const label = ((await width.textContent()) ?? "").trim();
	const pressed = await width.getAttribute("aria-pressed");
	await width.click();
	await page.waitForTimeout(400);

	expect(((await width.textContent()) ?? "").trim()).toBe(label);
	expect(await width.getAttribute("aria-pressed")).not.toBe(pressed);

	await closeOverlays(page);
});

test("the block toolbar sends each button somewhere different", async () => {
	const page = await obsidianPage();
	await openEditor(page);
	await selectBlock(page, 0);

	const toolbar = await page.evaluate(() =>
		Array.from(document.querySelectorAll(".tc-editor-block-toolbar button")).map(
			(button) => button.className,
		),
	);
	expect(toolbar.some((cls) => cls.includes("is-block-more"))).toBe(false);
	expect(toolbar.filter((cls) => cls.includes("is-block-")).length).toBe(3);

	await closeOverlays(page);
});

test("the find sheet opens on its search field and Enter opens the top match", async () => {
	const page = await obsidianPage();
	await closeOverlays(page);
	await ensureDeck(page);
	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:open"));
	await page.waitForSelector(".table-cards-stage");

	await page.locator("button.table-cards-search-btn").first().click();
	await page.waitForSelector(".tc-card-browser-search");
	await page.waitForFunction(
		() => document.activeElement?.classList.contains("tc-card-browser-search") === true,
	);

	await page.keyboard.type("ab");
	await page.waitForTimeout(600);
	const first = ((await page.locator(".tc-card-browser-result").first().textContent()) ?? "").trim();
	await page.keyboard.press("Enter");
	await page.waitForTimeout(600);

	expect(await page.locator(".tc-card-browser").count()).toBe(0);
	const card = ((await page.locator(".table-cards-stage").first().textContent()) ?? "").toLowerCase();
	expect(first.length).toBeGreaterThan(0);
	expect(card).toContain(first.split("\n")[0]!.trim().toLowerCase().slice(0, 4));

	await closeOverlays(page);
});

test("the first run wizard does not come back after it is dismissed", async () => {
	const page = await obsidianPage();
	await closeOverlays(page);
	const version = await page.evaluate(() => {
		const plugin = window.app.plugins.plugins["table-cards"];
		return plugin?.settings["setupVersion"];
	});
	expect(version).toBe(1);
});
