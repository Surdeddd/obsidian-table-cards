import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { closeOverlays, createDeckFromFile, obsidianPage } from "./harness/app";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");

const SHOTS = "artifacts/many-tables";

async function shoot(page: Page, name: string): Promise<void> {
	if (process.env["TABLE_CARDS_AUDIT"] !== "1") return;
	mkdirSync(SHOTS, { recursive: true });
	await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function openNotebook(page: Page): Promise<void> {
	await closeOverlays(page);
	const exists = await page.evaluate(() => {
		const plugin = window.app.plugins.plugins["table-cards"];
		const decks = (plugin?.settings["decks"] ?? []) as Array<{ name: string }>;
		return decks.some((deck) => deck.name === "Many");
	});
	if (!exists) await createDeckFromFile(page, "Many.md");
	await page.evaluate(() => {
		const plugin = window.app.plugins.plugins["table-cards"] as unknown as {
			updateSettings(mutate: (settings: unknown) => unknown): Promise<void>;
		};
		return plugin.updateSettings((settings) => {
			const typed = settings as {
				decks: Array<{ id: string; name: string; sources: Array<{ tables: { mode: string } }>; tableLayouts?: unknown[] }>;
				lastDeckId: string | null;
				perDeck: Record<string, unknown>;
			};
			const deck = typed.decks.find((item) => item.name === "Many");
			if (!deck) return typed;
			for (const source of deck.sources) source.tables = { mode: "all" };
			deck.tableLayouts = [];
			typed.lastDeckId = deck.id;
			typed.perDeck[deck.id] = { index: 0, shuffle: false, seed: 1, scope: { mode: "all" }, cardKey: null };
			return typed;
		});
	});
	await page.waitForTimeout(500);
	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:edit-layout"));
	await page.waitForSelector(".tc-editor-shell");
	await page.waitForSelector(".tc-editor-scope-bar");
	await page.waitForTimeout(600);
}

async function scopeLabels(page: Page): Promise<string[]> {
	await page.click(".tc-editor-scope-bar button.tc-listbox-trigger");
	await page.waitForSelector(".tc-listbox-options");
	await page.waitForTimeout(300);
	const labels = await page.$$eval(".tc-listbox-options button.tc-listbox-option span:first-child", (spans) =>
		spans.map((span) => span.textContent ?? ""),
	);
	return labels;
}

test("a six table deck offers one layout per table", async () => {
	test.setTimeout(240_000);
	const page = await obsidianPage();
	await page.setViewportSize({ width: 1440, height: 900 });
	await openNotebook(page);
	await shoot(page, "desktop-editor");

	const labels = await scopeLabels(page);
	await shoot(page, "desktop-scope-open");
	await page.keyboard.press("Escape");
	await page.waitForTimeout(300);

	expect(labels[0]).toBe("All tables");
	expect(labels).toHaveLength(7);
	for (const heading of ["Vocabulary", "Phrases", "Irregular verbs", "Prepositions", "Numbers", "Idioms"]) {
		expect(labels, `${heading} missing from the layout switch`).toContain(heading);
	}

	await closeOverlays(page);
});

test("every table can take its own layout and the deck keeps them apart", async () => {
	test.setTimeout(300_000);
	const page = await obsidianPage();
	await page.setViewportSize({ width: 1440, height: 900 });
	await openNotebook(page);

	const wanted = ["Phrases", "Irregular verbs", "Numbers", "Idioms"];
	for (const label of wanted) {
		await page.click(".tc-editor-scope-bar button.tc-listbox-trigger");
		await page.waitForSelector(".tc-listbox-options");
		await page.locator(".tc-listbox-options button.tc-listbox-option", { hasText: label }).first().click();
		await page.waitForTimeout(500);
		await page.locator(".tc-editor-scope-bar button.is-scope-toggle").click();
		await page.waitForTimeout(600);
	}
	await shoot(page, "desktop-four-own-layouts");

	await page.locator("button.tc-editor-save").click();
	await page.waitForTimeout(1200);

	const stored = await page.evaluate(() => {
		const plugin = window.app.plugins.plugins["table-cards"];
		const decks = (plugin?.settings["decks"] ?? []) as Array<{
			name: string;
			blocks: unknown[];
			tableLayouts?: Array<{ label: string; blocks: Array<{ columns: string[] }> }>;
		}>;
		const deck = decks.find((item) => item.name === "Many");
		return {
			deckBlocks: deck?.blocks.length ?? 0,
			layouts: (deck?.tableLayouts ?? []).map((layout) => ({
				label: layout.label,
				columns: layout.blocks.flatMap((block) => block.columns),
			})),
		};
	});

	expect(stored.layouts).toHaveLength(4);
	expect(stored.layouts.map((layout) => layout.label).sort()).toEqual([...wanted].sort());
	for (const layout of stored.layouts) {
		expect(layout.columns.length, `${layout.label} has no columns of its own`).toBeGreaterThan(0);
	}
	const irregular = stored.layouts.find((layout) => layout.label === "Irregular verbs");
	expect(irregular?.columns).toContain("Infinitive");
	expect(irregular?.columns).not.toContain("Word");

	await page.click(".tc-editor-scope-bar button.tc-listbox-trigger");
	await page.waitForSelector(".tc-listbox-options");
	await page.locator(".tc-listbox-options button.tc-listbox-option", { hasText: "All tables" }).first().click();
	await page.waitForTimeout(500);
	const overview = await page.locator(".tc-editor-scope-hint").first().textContent();
	await shoot(page, "desktop-overview");

	expect(overview, "the deck scope must say how many tables carry a layout of their own")
		.toBe("4 of 6 tables have a layout of their own.");

	await closeOverlays(page);
});

test("one action gives all six tables a layout of their own and one takes them back", async () => {
	test.setTimeout(300_000);
	const page = await obsidianPage();
	await page.setViewportSize({ width: 1440, height: 900 });
	await openNotebook(page);

	await page.locator(".tc-editor-scope-bar button.is-scope-toggle").click();
	await page.waitForTimeout(900);
	await shoot(page, "desktop-all-own-layouts");

	const afterBulk = await page.evaluate(() => {
		const hint = document.querySelector(".tc-editor-scope-hint")?.textContent?.trim() ?? "";
		const action = document.querySelector(".tc-editor-scope-bar button.is-scope-toggle")?.textContent?.trim() ?? "";
		return { hint, action };
	});

	expect(afterBulk.hint).toBe("6 of 6 tables have a layout of their own.");
	expect(afterBulk.action).toBe("Back to one shared layout");

	await page.locator(".tc-editor-scope-bar button.is-scope-toggle").click();
	await page.waitForTimeout(900);

	const afterUndo = await page.locator(".tc-editor-scope-hint").first().textContent();
	expect(afterUndo).toBe("One card layout for every table in the deck.");

	await closeOverlays(page);
});

test("a table titled by no keyword still gets a headline from its first column", async () => {
	test.setTimeout(300_000);
	const page = await obsidianPage();
	await page.setViewportSize({ width: 1440, height: 900 });
	await openNotebook(page);

	await page.click(".tc-editor-scope-bar button.tc-listbox-trigger");
	await page.waitForSelector(".tc-listbox-options");
	await page.locator(".tc-listbox-options button.tc-listbox-option", { hasText: "Idioms" }).first().click();
	await page.waitForTimeout(500);
	await page.locator(".tc-editor-scope-bar button.is-scope-toggle").click();
	await page.waitForTimeout(700);

	const headline = await page.evaluate(() => {
		const box = document.querySelector<HTMLElement>('.tc-editor-canvas-wrap .table-cards-box[data-kind="title"]');
		return { kind: box?.dataset.kind ?? "", text: box?.textContent?.trim() ?? "" };
	});

	expect(headline.kind).toBe("title");
	expect(headline.text).toContain("spill the beans");

	await closeOverlays(page);
});

test("the fields sheet names the tables a column comes from", async () => {
	test.setTimeout(300_000);
	const page = await obsidianPage();
	await page.setViewportSize({ width: 1440, height: 900 });
	await openNotebook(page);

	await page.click(".tc-editor-canvas-bar button.tc-editor-button:first-child");
	await page.waitForSelector(".tc-profile-list");
	await page.waitForTimeout(500);
	await shoot(page, "desktop-fields-owners");

	const owners = await page.evaluate(() => {
		const rows = Array.from(document.querySelectorAll<HTMLElement>(".tc-profile-identity"));
		return rows.map((row) => ({
			name: row.querySelector(".tc-profile-name")?.textContent?.trim() ?? "",
			from: row.querySelector(".tc-profile-owners")?.textContent?.trim() ?? "",
		}));
	});

	const word = owners.find((row) => row.name === "Word");
	const idiom = owners.find((row) => row.name === "Idiom");
	expect(word?.from).toBe("Vocabulary");
	expect(idiom?.from).toBe("Idioms");

	await closeOverlays(page);
});

test("a session draws every table of a six table deck with its own layout", async () => {
	test.setTimeout(300_000);
	const page = await obsidianPage();
	await page.setViewportSize({ width: 1440, height: 900 });
	await closeOverlays(page);
	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:open"));
	await page.waitForSelector(".table-cards-stage");
	await page.waitForTimeout(600);

	const seen: string[] = [];
	for (let card = 0; card < 12; card += 1) {
		const shape = await page.evaluate(() => {
			const stage = document.querySelector(".table-cards-stage");
			const source = stage?.querySelector(".table-cards-source-table")?.textContent?.trim() ?? "";
			const labels = Array.from(stage?.querySelectorAll(".table-cards-label") ?? []).map(
				(label) => label.textContent?.trim() ?? "",
			);
			return `${source}: ${labels.join(", ")}`;
		});
		if (!seen.includes(shape)) seen.push(shape);
		await page.click("button.table-cards-nav-next");
		await page.waitForTimeout(250);
	}
	await shoot(page, "desktop-session");

	expect(seen.length, "a six table deck should not draw one shape for everything").toBeGreaterThan(3);
	for (const shape of seen) {
		expect(shape, "a card rendered without any field").not.toMatch(/: $/);
	}

	await closeOverlays(page);
});
