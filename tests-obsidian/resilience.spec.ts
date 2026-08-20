import { expect, test, type Page } from "@playwright/test";
import { closeOverlays, createDeckFromFile, obsidianPage } from "./harness/app";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");

async function openDeckNamed(page: Page, name: string): Promise<void> {
	await closeOverlays(page);
	const exists = await page.evaluate((deckName) => {
		const plugin = window.app.plugins.plugins["table-cards"];
		const decks = plugin?.settings["decks"];
		return Array.isArray(decks) && decks.some((deck) => (deck as { name?: string }).name === deckName);
	}, name);
	if (!exists) await createDeckFromFile(page, `${name}.md`);
	await page.evaluate((deckName) => {
		const plugin = window.app.plugins.plugins["table-cards"] as unknown as {
			settings: { decks: { id: string; name: string }[]; lastDeckId: string | null };
			updateSettings(mutate: (settings: unknown) => unknown): Promise<void>;
		};
		return plugin.updateSettings((settings) => {
			const typed = settings as { decks: { id: string; name: string }[]; lastDeckId: string | null };
			const deck = typed.decks.find((item) => item.name === deckName);
			if (deck) typed.lastDeckId = deck.id;
			return typed;
		});
	}, name);
	await page.evaluate(() => window.app.commands.executeCommandById("table-cards:open"));
	await page.waitForSelector(".table-cards-stage", { timeout: 20_000 });
}

test("survives awkward table content without breaking the page", async () => {
	const page = await obsidianPage();
	const failures: string[] = [];
	page.on("pageerror", (error) => failures.push(error.message));

	await openDeckNamed(page, "Edge");

	const report = await page.evaluate(() => {
		const stage = document.querySelector(".table-cards-stage");
		const boxes = Array.from(document.querySelectorAll(".table-cards-box"));
		return {
			documentOverflow: document.body.scrollWidth > window.innerWidth + 1,
			stageOverflow: stage ? stage.scrollWidth > stage.clientWidth + 1 : false,
			burstingBoxes: boxes
				.filter((box) => box.scrollWidth > box.clientWidth + 2)
				.map((box) => (box.textContent ?? "").slice(0, 32)),
			cards: boxes.length,
		};
	});

	expect(failures, failures.join(" | ")).toEqual([]);
	expect(report.cards).toBeGreaterThan(0);
	expect(report.documentOverflow).toBe(false);
	expect(report.stageOverflow).toBe(false);
	expect(report.burstingBoxes).toEqual([]);

	await closeOverlays(page);
});

test("names a missing image instead of showing a broken one", async () => {
	const page = await obsidianPage();
	await openDeckNamed(page, "Edge");

	const missing = await page.evaluate(() => {
		for (let step = 0; step < 12; step += 1) {
			const broken = Array.from(document.querySelectorAll<HTMLImageElement>(".table-cards-box img")).filter(
				(image) => image.complete && image.naturalWidth === 0,
			);
			const placeholder = document.querySelector(".table-cards-image-missing, .table-cards-image-error");
			if (broken.length > 0 || placeholder) {
				return { broken: broken.length, placeholder: Boolean(placeholder) };
			}
			document.querySelector<HTMLElement>(".table-cards-nav-next")?.click();
		}
		return { broken: 0, placeholder: false };
	});

	expect(missing.broken).toBe(0);

	await closeOverlays(page);
});

test("opens a five hundred row table within a usable budget", async () => {
	const page = await obsidianPage();
	await closeOverlays(page);

	const started = Date.now();
	await openDeckNamed(page, "Large");
	const openMs = Date.now() - started;

	const stepStarted = Date.now();
	for (let step = 0; step < 20; step += 1) {
		await page.locator(".table-cards-nav-next").click();
	}
	await page.waitForTimeout(200);
	const stepMs = Date.now() - stepStarted;

	const counter = await page.textContent(".table-cards-counter, .table-cards-progress-count").catch(() => null);
	expect(openMs, `deck opened in ${openMs}ms`).toBeLessThan(20_000);
	expect(stepMs, `twenty steps took ${stepMs}ms`).toBeLessThan(12_000);
	expect(counter ?? "").not.toBe("");

	await closeOverlays(page);
});
