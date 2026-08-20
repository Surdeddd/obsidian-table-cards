import { chromium, type Page } from "@playwright/test";

export const CDP_URL = `http://127.0.0.1:${process.env["OBSIDIAN_CDP_PORT"] ?? 9333}`;

export async function obsidianPage(): Promise<Page> {
	const browser = await chromium.connectOverCDP(CDP_URL);
	const context = browser.contexts()[0];
	if (!context) throw new Error("Obsidian exposed no browser context");
	const page = context.pages()[0];
	if (!page) throw new Error("Obsidian exposed no page");
	return page;
}

export async function closeOverlays(page: Page): Promise<void> {
	await page.evaluate(() => window.app.setting?.close());
	for (let attempt = 0; attempt < 10; attempt += 1) {
		const open = await page.evaluate(() => document.querySelectorAll(".modal-container").length);
		if (open === 0) return;
		const discard = page.locator(".tc-confirm-actions .mod-warning");
		if ((await discard.count()) > 0) {
			await discard.first().click();
		} else {
			await page.keyboard.press("Escape");
		}
		await page.waitForTimeout(250);
	}
	throw new Error("overlays refused to close");
}

export async function deckCount(page: Page): Promise<number> {
	return page.evaluate(() => {
		const plugin = window.app.plugins.plugins["table-cards"];
		const decks = plugin?.settings["decks"];
		return Array.isArray(decks) ? decks.length : 0;
	});
}

export async function ensureDeck(page: Page): Promise<void> {
	if ((await deckCount(page)) > 0) {
		await useVocabDeck(page);
		return;
	}
	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:create-with-setup"));
	await page.waitForSelector(".table-cards-setup");
	await page.getByText("Add file", { exact: false }).first().click();
	await page.getByText("Vocab.md", { exact: false }).first().click();
	await page.getByText("Continue", { exact: false }).first().click();
	await page.getByText("Continue", { exact: false }).first().click();
	await page.getByText("Create deck", { exact: false }).first().click();
	await page.waitForFunction(() => {
		const plugin = window.app.plugins.plugins["table-cards"];
		const decks = plugin?.settings["decks"];
		return Array.isArray(decks) && decks.length > 0;
	});
	await closeOverlays(page);
}

export async function useVocabDeck(page: Page): Promise<void> {
	await page.evaluate(() => {
		const plugin = window.app.plugins.plugins["table-cards"] as unknown as {
			updateSettings(mutate: (settings: unknown) => unknown): Promise<void>;
		};
		return plugin.updateSettings((settings) => {
			const typed = settings as {
				decks: { id: string; name: string }[];
				lastDeckId: string | null;
				perDeck: Record<string, unknown>;
			};
			const vocab = typed.decks.find((deck) => deck.name === "Vocab") ?? typed.decks[0];
			if (!vocab) return typed;
			typed.lastDeckId = vocab.id;
			typed.perDeck[vocab.id] = {
				index: 0,
				shuffle: false,
				seed: 1,
				scope: { mode: "all" },
				cardKey: null,
			};
			return typed;
		});
	});
}

export async function createDeckFromFile(page: Page, fileName: string): Promise<void> {
	await closeOverlays(page);
	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:create-with-setup"));
	await page.waitForSelector(".table-cards-setup");
	const back = page.locator(".table-cards-setup button", { hasText: "Back" });
	for (let guard = 0; guard < 4 && (await back.count()) > 0; guard += 1) {
		await back.first().click();
		await page.waitForTimeout(300);
	}
	await page.getByText("Add file", { exact: false }).first().click();
	await page.getByText(fileName, { exact: true }).first().click();
	await page.waitForTimeout(500);
	for (let step = 0; step < 2; step += 1) {
		await page.locator(".table-cards-setup button", { hasText: "Continue" }).first().click();
		await page.waitForTimeout(600);
	}
	await page.locator(".table-cards-setup button", { hasText: "Create deck" }).first().click();
	await page.waitForTimeout(1200);
	await closeOverlays(page);
}

export async function openEditor(page: Page): Promise<void> {
	await closeOverlays(page);
	await ensureDeck(page);
	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:edit-layout"));
	await page.waitForSelector(".tc-editor-shell");
	await page.waitForFunction(() => document.querySelectorAll(".tc-editor-shell").length === 1);
}

export async function setBlockWidths(page: Page, widths: readonly ("half" | "full")[]): Promise<void> {
	await page.evaluate((next) => {
		const plugin = window.app.plugins.plugins["table-cards"] as unknown as {
			updateSettings(mutate: (settings: unknown) => unknown): Promise<void>;
		};
		return plugin.updateSettings((settings) => {
			const typed = settings as { decks: { blocks: { width: string }[] }[] };
			const blocks = typed.decks[0]?.blocks ?? [];
			next.forEach((width, index) => {
				const block = blocks[index];
				if (block) block.width = width;
			});
			return typed;
		});
	}, widths);
}

export async function selectBlock(page: Page, index: number): Promise<void> {
	await page.evaluate((position) => {
		const boxes = document.querySelectorAll<HTMLElement>(".tc-editor-canvas-wrap .table-cards-box");
		boxes[position]?.click();
	}, index);
	await page.waitForTimeout(400);
}

export interface BlockBox {
	x: number;
	y: number;
	w: number;
	width: "half" | "full";
}

export async function editorBlocks(page: Page): Promise<BlockBox[]> {
	return page.evaluate(() => {
		const stage = document.querySelector(".tc-editor-canvas-wrap");
		if (!stage) throw new Error("editor canvas missing");
		const stageWidth = stage.getBoundingClientRect().width;
		return Array.from(stage.querySelectorAll(".table-cards-box")).map((element) => {
			const box = element.getBoundingClientRect();
			return {
				x: Math.round(box.x),
				y: Math.round(box.y),
				w: Math.round(box.width),
				width: box.width > stageWidth * 0.72 ? ("full" as const) : ("half" as const),
			};
		});
	});
}

export async function dragWidthHandle(page: Page, dx: number): Promise<void> {
	const handle = await page.waitForSelector(".tc-resize-handle.is-width");
	const box = await handle.boundingBox();
	if (!box) throw new Error("width handle has no box");
	const startX = box.x + box.width / 2;
	const startY = box.y + box.height / 2;
	await page.mouse.move(startX, startY);
	await page.mouse.down();
	const steps = 8;
	for (let step = 1; step <= steps; step += 1) {
		await page.mouse.move(startX + (dx * step) / steps, startY);
		await page.waitForTimeout(20);
	}
	await page.mouse.up();
	await page.waitForTimeout(400);
}
