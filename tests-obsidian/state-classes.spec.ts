import { expect, test } from "@playwright/test";
import { closeOverlays, createDeckFromFile, ensureDeck, obsidianPage, openEditor, selectBlock } from "./harness/app";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");

test("the picker sizes its own modal and marks its open scope sheet", async () => {
	const page = await obsidianPage();
	await closeOverlays(page);
	await ensureDeck(page);
	const deckCount = await page.evaluate(() => {
		const plugin = window.app.plugins.plugins["table-cards"];
		return (plugin?.settings["decks"] as unknown[]).length;
	});
	if (deckCount < 2) await createDeckFromFile(page, "Facts.md");
	await page.evaluate(() => {
		const plugin = window.app.plugins.plugins["table-cards"] as unknown as {
			updateSettings(mutate: (settings: unknown) => unknown): Promise<void>;
		};
		return plugin.updateSettings((settings) => {
			(settings as { lastDeckId: string | null }).lastDeckId = null;
			return settings;
		});
	});
	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:open"));
	await page.waitForSelector(".tc-launcher");
	await page.waitForTimeout(700);

	const launcher = await page.evaluate(() => {
		const modal = document.querySelector<HTMLElement>(".modal.table-cards-modal");
		return {
			marked: modal?.classList.contains("is-launcher") ?? false,
			sized: modal ? modal.getBoundingClientRect().height < window.innerHeight - 40 : false,
		};
	});
	expect(launcher.marked).toBe(true);
	expect(launcher.sized).toBe(true);

	await page.locator("button.tc-scope-trigger").first().click();
	await page.waitForTimeout(500);
	const scope = await page.evaluate(() => {
		const root = document.querySelector<HTMLElement>(".tc-launcher");
		const body = document.querySelector<HTMLElement>(".tc-launcher-body");
		return {
			marked: root?.classList.contains("is-scope-open") ?? false,
			overflow: body ? getComputedStyle(body).overflow : "",
		};
	});
	expect(scope.marked).toBe(true);
	expect(scope.overflow).toBe("hidden");

	await page.keyboard.press("Escape");
	await page.waitForTimeout(400);
	const afterEscape = await page.evaluate(() => ({
		scopeOpen: document.querySelector(".tc-launcher")?.classList.contains("is-scope-open") ?? true,
		launcherOpen: document.querySelectorAll(".tc-launcher").length,
	}));
	expect(afterEscape.scopeOpen).toBe(false);
	expect(afterEscape.launcherOpen).toBe(1);

	await closeOverlays(page);
	await page.evaluate(() => {
		const plugin = window.app.plugins.plugins["table-cards"] as unknown as {
			updateSettings(mutate: (settings: unknown) => unknown): Promise<void>;
		};
		return plugin.updateSettings((settings) => {
			const typed = settings as { decks: { name: string }[] };
			typed.decks = typed.decks.filter((deck) => deck.name === "Vocab");
			return typed;
		});
	});
	await ensureDeck(page);
});

test("an open editor panel reserves room for itself beside the canvas", async () => {
	const page = await obsidianPage();
	await openEditor(page);
	await selectBlock(page, 0);

	const closed = await page.evaluate(() => ({
		marked: document.querySelector(".tc-editor-shell")?.classList.contains("is-sheet-open") ?? true,
		padding: getComputedStyle(
			document.querySelector<HTMLElement>(".tc-editor-canvas-wrap") ?? document.body,
		).paddingInlineEnd,
	}));
	expect(closed.marked).toBe(false);

	await page.locator("button.is-block-type").click();
	await page.waitForSelector(".tc-sheet");
	await page.waitForTimeout(500);

	const open = await page.evaluate(() => ({
		marked: document.querySelector(".tc-editor-shell")?.classList.contains("is-sheet-open") ?? false,
		padding: getComputedStyle(
			document.querySelector<HTMLElement>(".tc-editor-canvas-wrap") ?? document.body,
		).paddingInlineEnd,
	}));
	expect(open.marked).toBe(true);
	expect(Number.parseFloat(open.padding)).toBeGreaterThan(Number.parseFloat(closed.padding));

	await closeOverlays(page);
});
