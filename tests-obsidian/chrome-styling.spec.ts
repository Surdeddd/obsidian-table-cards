import { expect, test } from "@playwright/test";
import { closeOverlays, obsidianPage, openEditor } from "./harness/app";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");

function alphaOf(color: string): number {
	const match = color.match(/([\d.]+)\s*\)$/);
	if (color.startsWith("rgba") || color.startsWith("color(")) return Number(match?.[1] ?? "1");
	return 1;
}

test("keeps the panel scrim translucent so the canvas stays visible", async () => {
	const page = await obsidianPage();
	await openEditor(page);
	await page.evaluate(() => {
		document.querySelector<HTMLElement>(".tc-editor-canvas-wrap .table-cards-box")?.click();
	});
	await page.click(".is-block-more");
	await page.waitForSelector(".tc-sheet-scrim");

	const background = await page.evaluate(() => {
		const scrim = document.querySelector(".tc-sheet-scrim");
		if (!scrim) throw new Error("scrim missing");
		return getComputedStyle(scrim).backgroundColor;
	});

	expect(alphaOf(background)).toBeLessThan(0.6);

	await closeOverlays(page);
});

test("keeps plugin buttons on the plugin palette", async () => {
	const page = await obsidianPage();
	await openEditor(page);

	const backgrounds = await page.evaluate(() => {
		const interactiveNormal = getComputedStyle(document.body)
			.getPropertyValue("--interactive-normal")
			.trim();
		const read = (selector: string): string | null => {
			const element = document.querySelector(selector);
			return element ? getComputedStyle(element).backgroundColor : null;
		};
		const resolve = (value: string): string => {
			const probe = document.createElement("div");
			probe.style.backgroundColor = value;
			document.body.appendChild(probe);
			const resolved = getComputedStyle(probe).backgroundColor;
			probe.remove();
			return resolved;
		};
		return {
			interactiveNormal: resolve(interactiveNormal),
			editorButton: read(".tc-editor-button"),
			listboxTrigger: read(".tc-listbox-trigger"),
		};
	});

	expect(backgrounds.editorButton).not.toBe(backgrounds.interactiveNormal);

	await closeOverlays(page);
});
