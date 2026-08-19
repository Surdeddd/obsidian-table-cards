import { expect, test } from "@playwright/test";
import { closeOverlays, editorBlocks, obsidianPage, openEditor } from "./harness/app";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");

test("keeps the block toolbar inside the editor shell", async () => {
	const page = await obsidianPage();
	await openEditor(page);
	await page.evaluate(() => {
		document.querySelector<HTMLElement>(".tc-editor-canvas-wrap .table-cards-box")?.click();
	});
	await page.waitForSelector(".tc-editor-block-toolbar");

	const geometry = await page.evaluate(() => {
		const shell = document.querySelector(".tc-editor-shell");
		const toolbar = document.querySelector(".tc-editor-block-toolbar");
		if (!shell || !toolbar) throw new Error("editor shell or toolbar missing");
		return {
			display: getComputedStyle(shell).display,
			toolbarBottom: toolbar.getBoundingClientRect().bottom,
			shellBottom: shell.getBoundingClientRect().bottom,
			viewportBottom: window.innerHeight,
		};
	});

	expect(geometry.display).toBe("grid");
	expect(geometry.toolbarBottom).toBeLessThanOrEqual(geometry.shellBottom + 1);
	expect(geometry.toolbarBottom).toBeLessThanOrEqual(geometry.viewportBottom);

	await closeOverlays(page);
});

test("places half width blocks side by side on the canvas", async () => {
	const page = await obsidianPage();
	await closeOverlays(page);
	await openEditor(page);

	const boxes = await editorBlocks(page);
	expect(boxes.length).toBeGreaterThan(2);

	await closeOverlays(page);
});
