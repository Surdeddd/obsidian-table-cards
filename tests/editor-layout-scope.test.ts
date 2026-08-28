import { describe, expect, it } from "vitest";
import { createBlock, type TableCatalogItem } from "../src/model";
import {
	activeBlocks,
	createEditorState,
	hasOwnLayout,
	isDirty,
	reduceEditorState,
	repairLayoutKeys,
	undo,
	type EditorState,
} from "../src/editor/state";
import { createDeck } from "../src/settings/defaults";
import { tableKey } from "../src/deck/catalog";

function signature(headers: string[]): string {
	return headers.map((header) => header.toLocaleLowerCase()).join("\u001f");
}

function key(path: string, headers: string[], occurrence = 0): string {
	return tableKey(path, { headerSignature: signature(headers), occurrence });
}

function catalogItem(path: string, headers: string[], label = "Spending", occurrence = 0): TableCatalogItem {
	return {
		key: key(path, headers, occurrence),
		selector: { headerSignature: signature(headers), occurrence },
		sourcePath: path,
		sourceIds: ["source-1"],
		label,
		tableNumber: occurrence + 1,
		headingPath: [],
		headers: headers.slice(),
		rowCount: 2,
	};
}

const SPENDING = ["date", "amount", "category"];
const SPENDING_KEY = key("Money.md", SPENDING);

function mixedDeckState(): EditorState {
	return createEditorState(
		createDeck({
			blocks: [createBlock({ id: "deck-title", kind: "title", columns: ["Word"] })],
		}),
	);
}

function withTableLayout(): EditorState {
	return reduceEditorState(mixedDeckState(), {
		type: "addTableLayout",
		tableKey: SPENDING_KEY,
		label: "Spending",
		blocks: [createBlock({ id: "own-title", kind: "title", columns: ["amount"] })],
	});
}

describe("editor layout scope", () => {
	it("starts on the deck layout", () => {
		const state = mixedDeckState();

		expect(state.activeTableKey).toBeNull();
		expect(activeBlocks(state).map((block) => block.id)).toEqual(["deck-title"]);
	});

	it("shows the deck layout for a table that has none of its own", () => {
		const state = reduceEditorState(mixedDeckState(), { type: "selectLayout", tableKey: SPENDING_KEY });

		expect(hasOwnLayout(state.draft, SPENDING_KEY)).toBe(false);
		expect(activeBlocks(state).map((block) => block.id)).toEqual(["deck-title"]);
	});

	it("gives the table its own blocks and selects it", () => {
		const state = withTableLayout();

		expect(state.activeTableKey).toBe(SPENDING_KEY);
		expect(hasOwnLayout(state.draft, SPENDING_KEY)).toBe(true);
		expect(activeBlocks(state).map((block) => block.id)).toEqual(["own-title"]);
		expect(state.selectedBlockId).toBe("own-title");
	});

	it("edits the table layout without touching the deck layout", () => {
		const edited = reduceEditorState(withTableLayout(), {
			type: "patchBlock",
			blockId: "own-title",
			patch: { label: "Amount" },
		});

		expect(edited.draft.tableLayouts[0]?.blocks[0]?.label).toBe("Amount");
		expect(edited.draft.blocks[0]?.label).toBe("");
	});

	it("adds and removes blocks inside the active table layout only", () => {
		const added = reduceEditorState(withTableLayout(), {
			type: "addBlock",
			block: createBlock({ id: "own-note", kind: "note", columns: ["category"] }),
		});

		expect(added.draft.tableLayouts[0]?.blocks.map((block) => block.id)).toEqual(["own-title", "own-note"]);
		expect(added.draft.blocks.map((block) => block.id)).toEqual(["deck-title"]);

		const removed = reduceEditorState(added, { type: "removeBlock", blockId: "own-title" });

		expect(removed.draft.tableLayouts[0]?.blocks.map((block) => block.id)).toEqual(["own-note"]);
		expect(removed.draft.blocks.map((block) => block.id)).toEqual(["deck-title"]);
	});

	it("edits the deck layout again after switching back", () => {
		const back = reduceEditorState(withTableLayout(), { type: "selectLayout", tableKey: null });
		const edited = reduceEditorState(back, {
			type: "patchBlock",
			blockId: "deck-title",
			patch: { label: "Word" },
		});

		expect(edited.draft.blocks[0]?.label).toBe("Word");
		expect(edited.draft.tableLayouts[0]?.blocks[0]?.label).toBe("");
	});

	it("returns the table to the deck layout", () => {
		const followed = reduceEditorState(withTableLayout(), {
			type: "removeTableLayout",
			tableKey: SPENDING_KEY,
		});

		expect(followed.draft.tableLayouts).toEqual([]);
		expect(activeBlocks(followed).map((block) => block.id)).toEqual(["deck-title"]);
	});

	it("undoes a table layout in one step", () => {
		expect(undo(withTableLayout()).draft.tableLayouts).toEqual([]);
	});

	it("retires a column per layout instead of across the deck", () => {
		const state = reduceEditorState(withTableLayout(), {
			type: "setColumnEnabled",
			header: "amount",
			enabled: false,
		});

		expect(state.draft.tableLayouts[0]?.blocks).toEqual([]);
		expect(state.draft.blocks.map((block) => block.id)).toEqual(["deck-title"]);

		const restored = reduceEditorState(state, { type: "setColumnEnabled", header: "amount", enabled: true });

		expect(restored.draft.tableLayouts[0]?.blocks.map((block) => block.id)).toEqual(["own-title"]);
	});

	it("retargets a stored layout to a table that changed columns without dirtying the draft", () => {
		const saved = withTableLayout();
		const clean: EditorState = { ...saved, baseline: saved.draft, past: [], future: [] };
		expect(isDirty(clean)).toBe(false);

		const live = [catalogItem("Money.md", [...SPENDING, "note"])];
		const repaired = repairLayoutKeys(clean, live);

		expect(repaired.draft.tableLayouts[0]?.tableKey).toBe(live[0]!.key);
		expect(repaired.baseline.tableLayouts[0]?.tableKey).toBe(live[0]!.key);
		expect(isDirty(repaired)).toBe(false);
	});

	it("leaves the state alone when nothing moved", () => {
		const state = withTableLayout();

		expect(repairLayoutKeys(state, [catalogItem("Money.md", SPENDING)])).toBe(state);
	});
});
