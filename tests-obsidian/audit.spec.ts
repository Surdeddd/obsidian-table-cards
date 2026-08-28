import { mkdirSync } from "node:fs";
import { test, type Page } from "@playwright/test";
import { closeOverlays, ensureDeck, obsidianPage, openEditor } from "./harness/app";

test.skip(process.env["TABLE_CARDS_AUDIT"] !== "1", "Visual audit runs on request");

const SHOTS = "artifacts/audit";

async function useTheme(page: Page, theme: "dark" | "light"): Promise<void> {
	await page.evaluate((mode) => {
		document.body.classList.remove("theme-dark", "theme-light");
		document.body.classList.add(mode === "dark" ? "theme-dark" : "theme-light");
	}, theme);
	await page.waitForTimeout(200);
}

async function shoot(page: Page, name: string): Promise<void> {
	mkdirSync(SHOTS, { recursive: true });
	await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function useEveryTable(page: Page): Promise<void> {
	await page.evaluate(() => {
		const plugin = window.app.plugins.plugins["table-cards"] as unknown as {
			updateSettings(mutate: (settings: unknown) => unknown): Promise<void>;
		};
		return plugin.updateSettings((settings) => {
			const typed = settings as {
				decks: Array<{ name: string; sources: Array<{ tables: { mode: string } }> }>;
			};
			const deck = typed.decks.find((item) => item.name === "Vocab") ?? typed.decks[0];
			if (!deck) return typed;
			for (const source of deck.sources) source.tables = { mode: "all" };
			return typed;
		});
	});
}

const VIEWPORTS = [
	{ name: "desktop", width: 1440, height: 900 },
	{ name: "phone", width: 390, height: 844 },
];

test("captures every surface in both themes", async () => {
	test.setTimeout(600_000);
	const page = await obsidianPage();
	await closeOverlays(page);
	await ensureDeck(page);
	await useEveryTable(page);

	for (const viewport of VIEWPORTS) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		for (const theme of ["dark", "light"] as const) {
			const tag = `${viewport.name}-${theme}`;
			await closeOverlays(page);
			await useTheme(page, theme);

			await page.evaluate(() => window.app.commands.executeCommandById("table-cards:open"));
			await page.waitForSelector(".table-cards-stage");
			await page.waitForTimeout(500);
			await shoot(page, `${tag}-session`);

			await page.click("button.table-cards-search-btn");
			await page.waitForSelector(".tc-card-browser");
			await page.waitForTimeout(400);
			await shoot(page, `${tag}-session-search`);
			await page.keyboard.press("Escape");
			await page.waitForTimeout(300);

			await page.click("button.table-cards-scope-btn");
			await page.waitForSelector(".tc-scope-picker");
			await page.waitForTimeout(400);
			await shoot(page, `${tag}-session-scope`);
			await closeOverlays(page);

			await openEditor(page);
			await page.waitForTimeout(500);
			await shoot(page, `${tag}-editor`);

			await page.evaluate(() => {
				document.querySelector<HTMLElement>(".tc-editor-canvas-wrap .table-cards-box")?.click();
			});
			await page.waitForTimeout(400);
			await shoot(page, `${tag}-editor-selected`);

			await page.click(".tc-editor-block-toolbar button.is-block-type");
			await page.waitForSelector(".tc-sheet");
			await page.waitForTimeout(400);
			await shoot(page, `${tag}-editor-block`);
			await page.keyboard.press("Escape");
			await page.waitForTimeout(300);

			await page.click(".tc-editor-block-toolbar button.is-block-move");
			await page.waitForSelector(".tc-reorder-row");
			await page.waitForTimeout(400);
			await shoot(page, `${tag}-editor-order`);
			await page.keyboard.press("Escape");
			await page.waitForTimeout(300);

			await page.click(".tc-editor-canvas-bar button.tc-editor-button:last-child");
			await page.waitForSelector(".tc-sheet");
			await page.waitForTimeout(400);
			await shoot(page, `${tag}-editor-card-style`);
			await page.keyboard.press("Escape");
			await page.waitForTimeout(300);

			await page.click(".tc-editor-canvas-bar button.tc-editor-button:first-child");
			await page.waitForSelector(".tc-sheet");
			await page.waitForTimeout(400);
			await shoot(page, `${tag}-editor-fields`);
			await closeOverlays(page);

			await page.evaluate(() => window.app.commands.executeCommandById("table-cards:create-with-setup"));
			await page.waitForSelector(".table-cards-setup");
			await page.waitForTimeout(500);
			await shoot(page, `${tag}-setup`);
			const addFile = page.getByText("Add file", { exact: false }).first();
			if ((await addFile.count()) > 0) {
				await addFile.click();
				await page.waitForTimeout(600);
				await shoot(page, `${tag}-setup-pick-file`);
				const vocab = page.getByText("Vocab.md", { exact: true }).first();
				if ((await vocab.count()) > 0) {
					await vocab.click();
					await page.waitForTimeout(700);
					await shoot(page, `${tag}-setup-sources`);
					const next = page.locator(".table-cards-setup button", { hasText: "Continue" }).first();
					if ((await next.count()) > 0) {
						await next.click();
						await page.waitForTimeout(800);
						await shoot(page, `${tag}-setup-presets`);
						await next.click();
						await page.waitForTimeout(800);
						await shoot(page, `${tag}-setup-finish`);
					}
				}
			}
			await closeOverlays(page);

			const pinned = await page.evaluate(() => {
				const plugin = window.app.plugins.plugins["table-cards"] as unknown as {
					settings: { lastDeckId: string | null };
					updateSettings(mutate: (settings: unknown) => unknown): Promise<void>;
				};
				const previous = plugin.settings.lastDeckId;
				return plugin.updateSettings((settings) => {
					(settings as { lastDeckId: string | null }).lastDeckId = null;
					return settings;
				}).then(() => previous);
			});
			await page.evaluate(() => window.app.commands.executeCommandById("table-cards:open"));
			await page.waitForSelector(".modal.table-cards-modal");
			await page.waitForTimeout(700);
			await shoot(page, `${tag}-launcher`);
			await closeOverlays(page);
			await page.evaluate((deckId) => {
				const plugin = window.app.plugins.plugins["table-cards"] as unknown as {
					updateSettings(mutate: (settings: unknown) => unknown): Promise<void>;
				};
				return plugin.updateSettings((settings) => {
					(settings as { lastDeckId: string | null }).lastDeckId = deckId;
					return settings;
				});
			}, pinned);
			await page.waitForTimeout(300);
		}
	}

	await page.setViewportSize({ width: 1440, height: 900 });
	await useTheme(page, "dark");
});

test("captures the mirrored interface", async () => {
	test.setTimeout(600_000);
	const page = await obsidianPage();
	await closeOverlays(page);
	await ensureDeck(page);
	await useEveryTable(page);
	await page.evaluate(() => {
		const plugin = window.app.plugins.plugins["table-cards"] as unknown as {
			updateSettings(mutate: (settings: unknown) => unknown): Promise<void>;
		};
		return plugin.updateSettings((settings) => {
			(settings as { locale: string }).locale = "ar";
			return settings;
		});
	});
	await page.waitForTimeout(400);

	for (const viewport of VIEWPORTS) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await closeOverlays(page);
		const tag = `${viewport.name}-rtl`;

		await page.evaluate(() => window.app.commands.executeCommandById("table-cards:open"));
		await page.waitForSelector(".table-cards-stage");
		await page.waitForTimeout(500);
		await shoot(page, `${tag}-session`);

		await page.click("button.table-cards-search-btn");
		await page.waitForSelector(".tc-card-browser");
		await page.waitForTimeout(400);
		await shoot(page, `${tag}-session-search`);
		await closeOverlays(page);

		await openEditor(page);
		await page.waitForTimeout(500);
		await shoot(page, `${tag}-editor`);

		await page.click(".tc-editor-canvas-bar button.tc-editor-button:last-child");
		await page.waitForSelector(".tc-sheet");
		await page.waitForTimeout(400);
		await shoot(page, `${tag}-editor-card-style`);
		await closeOverlays(page);
	}

	await page.evaluate(() => {
		const plugin = window.app.plugins.plugins["table-cards"] as unknown as {
			updateSettings(mutate: (settings: unknown) => unknown): Promise<void>;
		};
		return plugin.updateSettings((settings) => {
			(settings as { locale: string }).locale = "auto";
			return settings;
		});
	});
	await page.setViewportSize({ width: 1440, height: 900 });
});
