import { expect, test, type Page } from "@playwright/test";
import { closeOverlays, ensureDeck, obsidianPage } from "./harness/app";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");

async function setLocale(page: Page, locale: string): Promise<void> {
	await page.evaluate((value) => {
		const plugin = window.app.plugins.plugins["table-cards"] as unknown as {
			updateSettings(mutate: (settings: unknown) => unknown): Promise<void>;
		};
		return plugin.updateSettings((settings) => {
			(settings as { locale: string }).locale = value;
			return settings;
		});
	}, locale);
}

test("an Arabic session mirrors its chrome without reversing the card count", async () => {
	const page = await obsidianPage();
	await closeOverlays(page);
	await ensureDeck(page);
	await setLocale(page, "ar");
	try {
		await page.evaluate(() => window.app.commands.executeCommandById("table-cards:open"));
		await page.waitForSelector(".table-cards-stage");

		const report = await page.evaluate(() => {
			const modal = document.querySelector(".modal.table-cards-modal");
			const counter = document.querySelector<HTMLElement>(".table-cards-counter .tc-figure-pair");
			const nextIcon = document.querySelector<SVGElement>(".table-cards-nav-icon > svg");
			const prevIcon = document.querySelector<SVGElement>(".table-cards-nav-btn > svg");
			return {
				dir: modal?.getAttribute("dir") ?? "",
				counterText: counter?.textContent?.trim() ?? "",
				counterDirection: counter ? getComputedStyle(counter).direction : "",
				nextTransform: nextIcon ? getComputedStyle(nextIcon).transform : "",
				prevTransform: prevIcon ? getComputedStyle(prevIcon).transform : "",
			};
		});

		expect(report.dir).toBe("rtl");
		expect(report.counterDirection).toBe("ltr");
		expect(report.counterText).toMatch(/^\S+\s\/\s\S+$/u);
		expect(report.nextTransform).toContain("-1");
		expect(report.prevTransform).toContain("-1");
	} finally {
		await closeOverlays(page);
		await setLocale(page, "auto");
	}
});
