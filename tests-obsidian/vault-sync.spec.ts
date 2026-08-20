import { expect, test } from "@playwright/test";
import { closeOverlays, ensureDeck, obsidianPage } from "./harness/app";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");

test("a deck follows its note when the vault renames it", async () => {
	const page = await obsidianPage();
	await closeOverlays(page);
	await ensureDeck(page);

	const before = await page.evaluate(() => {
		const plugin = window.app.plugins.plugins["table-cards"];
		const decks = plugin?.settings["decks"] as { sources: { path: string }[] }[];
		return decks?.[0]?.sources.map((source) => source.path) ?? [];
	});
	expect(before).toContain("Vocab.md");

	await page.evaluate(async () => {
		const file = window.app.vault.getAbstractFileByPath("Vocab.md");
		if (file) await window.app.vault.rename(file, "Renamed Vocab.md");
	});
	await page.waitForFunction(() => {
		const plugin = window.app.plugins.plugins["table-cards"];
		const decks = plugin?.settings["decks"] as { sources: { path: string }[] }[];
		return decks?.[0]?.sources.some((source) => source.path === "Renamed Vocab.md") === true;
	}, undefined, { timeout: 10_000 });

	await page.evaluate(async () => {
		const file = window.app.vault.getAbstractFileByPath("Renamed Vocab.md");
		if (file) await window.app.vault.rename(file, "Vocab.md");
	});
	await page.waitForFunction(() => {
		const plugin = window.app.plugins.plugins["table-cards"];
		const decks = plugin?.settings["decks"] as { sources: { path: string }[] }[];
		return decks?.[0]?.sources.some((source) => source.path === "Vocab.md") === true;
	}, undefined, { timeout: 10_000 });
});
