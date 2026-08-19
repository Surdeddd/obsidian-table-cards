import { expect, test } from "@playwright/test";
import { closeOverlays, ensureDeck, obsidianPage, openEditor } from "./harness/app";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");

type Alignment = "left" | "center" | "right";

async function alignFirstBlock(page: import("@playwright/test").Page, align: Alignment): Promise<void> {
	await page.evaluate((value) => {
		const plugin = window.app.plugins.plugins["table-cards"] as unknown as {
			updateSettings(mutate: (settings: unknown) => unknown): Promise<void>;
		};
		return plugin.updateSettings((settings) => {
			const typed = settings as {
				decks: { blocks: { kind: string; appearance: Record<string, unknown> }[] }[];
			};
			for (const block of typed.decks[0]?.blocks ?? []) block.appearance["align"] = value;
			return typed;
		});
	}, align);
}

async function contentOffsets(page: import("@playwright/test").Page): Promise<Record<string, number>> {
	return page.evaluate(() => {
		const stage = document.querySelector(".tc-editor-canvas-wrap");
		if (!stage) throw new Error("canvas missing");
		const offsets: Record<string, number> = {};
		const chips = stage.querySelector(".table-cards-pron > *");
		const note = stage.querySelector(".table-cards-tip");
		const text = stage.querySelector(".table-cards-value, .table-cards-title");
		if (chips) offsets["chips"] = Math.round(chips.getBoundingClientRect().x);
		if (note) offsets["note"] = Math.round(note.getBoundingClientRect().x);
		if (text) offsets["text"] = Math.round(text.getBoundingClientRect().x);
		offsets["stage"] = Math.round(stage.getBoundingClientRect().x);
		return offsets;
	});
}

test("moves flex content when alignment changes, not only plain text", async () => {
	const page = await obsidianPage();
	await closeOverlays(page);
	await ensureDeck(page);

	await alignFirstBlock(page, "left");
	await openEditor(page);
	const left = await contentOffsets(page);
	await closeOverlays(page);

	await alignFirstBlock(page, "right");
	await openEditor(page);
	const right = await contentOffsets(page);
	await closeOverlays(page);

	for (const key of Object.keys(left)) {
		if (key === "stage") continue;
		expect(right[key], `${key} did not move when aligned right`).toBeGreaterThan(left[key] ?? 0);
	}
});
