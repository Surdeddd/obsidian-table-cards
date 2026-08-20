import { describe, expect, it } from "vitest";
import { createBlock, type DeckSource, type TableSelector } from "../src/model";
import {
	createEditorState,
	isDirty,
	markSaved,
	reduceEditorState,
	redo,
	undo,
} from "../src/editor/state";
import { createDeck } from "../src/settings/defaults";
import { representativeRowIndexes } from "../src/editor/rows";
import { parseCell } from "../src/parse/tables";
import type { Card } from "../src/model";

function stateWithBlocks(...ids: string[]) {
	return createEditorState(
		createDeck({ blocks: ids.map((id) => createBlock({ id, width: "half", columns: [id.toUpperCase()] })) }),
	);
}

const selector = (headerSignature: string, occurrence: number): TableSelector => ({
	headerSignature,
	occurrence,
});

const sourceAll = (path: string): DeckSource => ({
	id: `source-${path}`,
	kind: "file",
	path,
	tables: { mode: "all" },
});

describe("editor state", () => {
	it("changes only the draft and records one undo state", () => {
		const persisted = createDeck({ blocks: [createBlock({ id: "a", width: "half" })] });
		const initial = createEditorState(persisted);
		const next = reduceEditorState(initial, { type: "setBlockWidth", blockId: "a", width: "full" });
		expect(persisted.blocks[0]?.width).toBe("half");
		expect(next.draft.blocks[0]?.width).toBe("full");
		expect(next.past).toHaveLength(1);
		expect(undo(next).draft.blocks[0]?.width).toBe("half");
	});

	it("reorders pointer and keyboard interactions through one action", () => {
		const initial = stateWithBlocks("a", "b", "c");
		const next = reduceEditorState(initial, { type: "moveBlock", blockId: "c", toIndex: 0 });
		expect(next.draft.blocks.map((block) => block.id)).toEqual(["c", "a", "b"]);
		expect(next.past).toHaveLength(1);
		expect(undo(next).draft.blocks.map((block) => block.id)).toEqual(["a", "b", "c"]);
		expect(redo(undo(next)).draft.blocks.map((block) => block.id)).toEqual(["c", "a", "b"]);
	});

	it("keeps at most 100 past states", () => {
		let state = stateWithBlocks("a");
		for (let index = 0; index < 120; index += 1) {
			state = reduceEditorState(state, {
				type: "patchBlock",
				blockId: "a",
				patch: { label: String(index) },
			});
		}
		expect(state.past).toHaveLength(100);
	});

	it("deep-merges nested block settings", () => {
		const initial = createEditorState(
			createDeck({
				blocks: [
					createBlock({
						id: "a",
						overflow: { mode: "ellipsis", minFontPx: 16, maxLines: 3 },
					}),
				],
			}),
		);
		const next = reduceEditorState(initial, {
			type: "patchBlock",
			blockId: "a",
			patch: { overflow: { maxLines: 5 } },
		});
		expect(next.draft.blocks[0]?.overflow).toEqual({ mode: "ellipsis", minFontPx: 16, maxLines: 5 });
	});

	it("does not record transient selection, panel, or preview-row actions", () => {
		let state = stateWithBlocks("a");
		state = reduceEditorState(state, { type: "selectBlock", blockId: "a" });
		state = reduceEditorState(state, { type: "openPanel", panel: "block" });
		state = reduceEditorState(state, { type: "setPreviewRow", index: 4 });
		expect(state.past).toEqual([]);
		expect(isDirty(state)).toBe(false);
	});

	it("enables and disables a column across blocks", () => {
		let state = stateWithBlocks("a", "b");
		state = reduceEditorState(state, { type: "setColumnEnabled", header: "A", enabled: false });
		expect(state.draft.blocks.map((block) => block.columns)).toEqual([["B"]]);
		state = reduceEditorState(state, { type: "setColumnType", header: "Picture", dataType: "image" });
		state = reduceEditorState(state, { type: "setColumnEnabled", header: "Picture", enabled: true });
		expect(state.draft.blocks.at(-1)).toMatchObject({ kind: "image", columns: ["Picture"] });
	});

	it("keeps the baseline unchanged so cancel can discard the draft", () => {
		const initial = stateWithBlocks("a");
		const next = reduceEditorState(initial, { type: "patchBlock", blockId: "a", patch: { label: "changed" } });
		expect(isDirty(next)).toBe(true);
		expect(next.baseline.blocks[0]?.label).toBe("");
		expect(createEditorState(next.baseline).draft.blocks[0]?.label).toBe("");
	});

	it("clears dirty on save without losing history, selection or preview row", () => {
		let state = stateWithBlocks("a", "b");
		state = reduceEditorState(state, { type: "selectBlock", blockId: "b" });
		state = reduceEditorState(state, { type: "setPreviewRow", index: 3 });
		state = reduceEditorState(state, { type: "patchBlock", blockId: "b", patch: { label: "changed" } });

		const saved = markSaved(state, state.draft);

		expect(isDirty(saved)).toBe(false);
		expect(saved.past).toHaveLength(1);
		expect(saved.selectedBlockId).toBe("b");
		expect(saved.previewRow).toBe(3);
		expect(isDirty(undo(saved))).toBe(true);
	});

	it("keeps v3 source table selections in the editable draft", () => {
		const persisted = createDeck({
			sources: [{
				id: "source",
				kind: "file",
				path: "cards.md",
				tables: { mode: "include", selectors: [{ headerSignature: "term\u001fru", occurrence: 0 }] },
			}],
		});
		const state = createEditorState(persisted);
		expect(state.draft.sources[0]?.tables).toEqual({
			mode: "include",
			selectors: [{ headerSignature: "term\u001fru", occurrence: 0 }],
		});
	});

	it("changes multiple table selectors through one undoable source action", () => {
		const initial = createEditorState(createDeck({ sources: [sourceAll("words.md")] }));
		const selectors = [selector("a", 0), selector("b", 0)];
		const next = reduceEditorState(initial, {
			type: "replaceSources",
			sources: [{ ...initial.draft.sources[0]!, tables: { mode: "include", selectors } }],
		});

		expect(next.draft.sources[0]?.tables).toEqual({ mode: "include", selectors });
		expect(next.past).toHaveLength(1);
		expect(undo(next).draft.sources[0]?.tables).toEqual({ mode: "all" });
	});
});

describe("representative preview rows", () => {
	it("finds the longest and most-empty cards", () => {
		const origin = (rowNumber: number) => ({
			tableKey: "x.md\u0000x\u00000",
			tableLabel: "Table 1",
			tableNumber: 1,
			sourcePath: "x.md",
			rowNumber,
			rowKey: `row-${rowNumber}`,
		});
		const cards: Card[] = [
			{ cells: { A: parseCell("short"), B: parseCell("filled") }, headers: ["A", "B"], origin: origin(1) },
			{ cells: { A: parseCell("a very long value"), B: parseCell("filled") }, headers: ["A", "B"], origin: origin(2) },
			{ cells: { A: parseCell(""), B: parseCell("") }, headers: ["A", "B"], origin: origin(3) },
		];
		expect(representativeRowIndexes(cards)).toEqual({ first: 0, longest: 1, mostEmpty: 2 });
	});

	it("returns zeroes for an empty deck", () => {
		expect(representativeRowIndexes([])).toEqual({ first: 0, longest: 0, mostEmpty: 0 });
	});
});
