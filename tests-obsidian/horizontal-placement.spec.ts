import { expect, test } from "@playwright/test";
import {
	closeOverlays,
	dragWidthHandle,
	editorBlocks,
	ensureDeck,
	obsidianPage,
	openEditor,
	selectBlock,
	setBlockWidths,
} from "./harness/app";

test.skip(process.env["TABLE_CARDS_OBSIDIAN"] !== "ready", "Obsidian binary not available");

test.beforeEach(async () => {
	const page = await obsidianPage();
	await closeOverlays(page);
	await ensureDeck(page);
	await setBlockWidths(page, ["full", "half", "half"]);
});

test.afterEach(async () => {
	const page = await obsidianPage();
	await closeOverlays(page);
});

test("puts two half width blocks on one row", async () => {
	const page = await obsidianPage();
	await openEditor(page);

	const blocks = await editorBlocks(page);

	expect(blocks[1]?.width).toBe("half");
	expect(blocks[2]?.width).toBe("half");
	expect(blocks[1]?.y).toBe(blocks[2]?.y);
	expect(blocks[1]?.x).toBeLessThan(blocks[2]?.x ?? 0);
});

test("keeps the second column block half width when its handle is nudged", async () => {
	const page = await obsidianPage();
	await openEditor(page);
	await selectBlock(page, 2);

	await dragWidthHandle(page, -24);

	const blocks = await editorBlocks(page);
	expect(blocks.slice(0, 3).map((block) => block.width)).toEqual(["full", "half", "half"]);
});

test("keeps blocks in their authored order when one becomes half width", async () => {
	const page = await obsidianPage();
	await setBlockWidths(page, ["half", "full", "half"]);
	await openEditor(page);

	const blocks = await editorBlocks(page);
	const tops = blocks.slice(0, 3).map((block) => block.y);

	expect(tops[0]).toBeLessThan(tops[1] ?? 0);
	expect(tops[1]).toBeLessThanOrEqual(tops[2] ?? 0);
});

test("turns a first column block full width when its handle crosses the card", async () => {
	const page = await obsidianPage();
	await openEditor(page);
	await selectBlock(page, 1);

	await dragWidthHandle(page, 380);

	const blocks = await editorBlocks(page);
	expect(blocks[1]?.width).toBe("full");
});

test("returns a full width block to half when its handle is dragged back", async () => {
	const page = await obsidianPage();
	await setBlockWidths(page, ["full", "full", "half"]);
	await openEditor(page);
	await selectBlock(page, 1);

	await dragWidthHandle(page, -420);

	const blocks = await editorBlocks(page);
	expect(blocks[1]?.width).toBe("half");
});
