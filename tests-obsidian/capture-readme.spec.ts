import { test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { closeOverlays, createDeckFromFile, ensureDeck, obsidianPage } from "./harness/app";

test.skip(process.env["TABLE_CARDS_README_SHOTS"] !== "1", "README capture runs on demand");

const OUT = join(process.cwd(), "docs/screenshots");

async function shoot(page: Page, name: string): Promise<void> {
	await mkdir(OUT, { recursive: true });
	await page.mouse.move(1430, 8);
	await page.waitForTimeout(600);
	await page.screenshot({ path: join(OUT, `${name}.png`), animations: "disabled" });
}

async function deckNames(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const plugin = window.app.plugins.plugins["table-cards"];
		return (plugin?.settings["decks"] as { name: string }[]).map((deck) => deck.name);
	});
}

test("captures the README stills from the running app", async () => {
	test.setTimeout(240_000);
	const page = await obsidianPage();
	await page.setViewportSize({ width: 1440, height: 1000 });
	await closeOverlays(page);
	await ensureDeck(page);
	await page.evaluate(() => {
		document.body.classList.add("theme-light");
		document.body.classList.remove("theme-dark");
	});

	if ((await deckNames(page)).length < 2) await createDeckFromFile(page, "Facts.md");
	await closeOverlays(page);
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
	await page.waitForTimeout(1500);
	await shoot(page, "launcher-desktop");
	await closeOverlays(page);

	await page.evaluate(() => {
		const plugin = window.app.plugins.plugins["table-cards"] as unknown as {
			updateSettings(mutate: (settings: unknown) => unknown): Promise<void>;
		};
		return plugin.updateSettings((settings) => {
			const typed = settings as { decks: { id: string; name: string }[]; lastDeckId: string | null };
			typed.decks = typed.decks.filter((deck) => deck.name === "Vocab");
			typed.lastDeckId = typed.decks[0]?.id ?? null;
			return typed;
		});
	});

	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:edit-layout"));
	await page.waitForSelector(".tc-editor-shell");
	await page.waitForTimeout(600);
	await page.locator(".tc-editor-canvas-bar button.tc-editor-button").first().click();
	await page.waitForSelector(".tc-sheet");
	await page.waitForTimeout(400);
	const chooseTables = page.locator(".tc-sheet button", { hasText: /tables/i }).first();
	if ((await chooseTables.count()) > 0) {
		await chooseTables.click();
		await page.waitForTimeout(800);
	}
	await shoot(page, "editor-tables-desktop");
	await closeOverlays(page);

	await page.evaluate(async () => {
		const file = window.app.vault.getAbstractFileByPath("Vocab.md");
		if (file) await window.app.workspace.getLeaf(false).openFile(file);
	});
	await page.waitForTimeout(1200);
	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:create-with-setup"));
	await page.waitForSelector(".table-cards-setup");
	await page.waitForTimeout(2500);
	const next = page.locator(".table-cards-setup button", { hasText: "Continue" }).first();
	if ((await next.count()) > 0 && !(await next.isDisabled())) {
		await next.click();
		await page.waitForTimeout(2000);
	}
	await shoot(page, "setup-presets-desktop");
	await closeOverlays(page);
	await ensureDeck(page);
});
