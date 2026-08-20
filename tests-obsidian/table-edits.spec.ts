import { expect, test, type Page } from "@playwright/test";
import { closeOverlays, ensureDeck, obsidianPage } from "./harness/app";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");

const HEADER = "| Word | Translation | Example | Level |";
const SEPARATOR = "| --- | --- | --- | --- |";

async function readNote(page: Page, path: string): Promise<string> {
	return page.evaluate(async (target) => {
		const file = window.app.vault.getAbstractFileByPath(target);
		return file ? window.app.vault.read(file) : "";
	}, path);
}

async function writeNote(page: Page, path: string, body: string): Promise<void> {
	await page.evaluate(
		async ({ target, text }) => {
			const file = window.app.vault.getAbstractFileByPath(target);
			if (file) await window.app.vault.modify(file, text);
		},
		{ target: path, text: body },
	);
	await page.waitForTimeout(800);
}

async function pinVocabularyTable(page: Page): Promise<void> {
	await page.evaluate(() => {
		const plugin = window.app.plugins.plugins["table-cards"] as unknown as {
			updateSettings(mutate: (settings: unknown) => unknown): Promise<void>;
		};
		return plugin.updateSettings((settings) => {
			const typed = settings as {
				decks: { name: string; sources: { tables: unknown }[] }[];
			};
			const source = typed.decks.find((deck) => deck.name === "Vocab")?.sources[0];
			if (source) {
				source.tables = {
					mode: "include",
					selectors: [{ headerSignature: "wordtranslationexamplelevel", occurrence: 0 }],
				};
			}
			return typed;
		});
	});
}

async function visibleCards(page: Page): Promise<number> {
	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:open"));
	await page.waitForTimeout(2500);
	const count = await page.evaluate(
		() => document.querySelectorAll(".table-cards-stage .table-cards-box").length,
	);
	await closeOverlays(page);
	return count;
}

test("a deck pinned to a table survives a new column in that table", async () => {
	const page = await obsidianPage();
	await closeOverlays(page);
	await ensureDeck(page);
	await pinVocabularyTable(page);

	const original = await readNote(page, "Vocab.md");
	expect(original).toContain(HEADER);
	expect(await visibleCards(page)).toBeGreaterThan(0);

	try {
		const widened = original
			.replace(HEADER, "| Word | Translation | Example | Level | Audio |")
			.replace(SEPARATOR, "| --- | --- | --- | --- | --- |")
			.replace(/^\| (abandon|brisk|candid) \| (.*) \| (.*) \| (.*) \|$/gm, "| $1 | $2 | $3 | $4 | |");
		await writeNote(page, "Vocab.md", widened);

		expect(await visibleCards(page)).toBeGreaterThan(0);
	} finally {
		await writeNote(page, "Vocab.md", original);
		await ensureDeck(page);
	}
});
