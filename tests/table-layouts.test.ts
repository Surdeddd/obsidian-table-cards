import { describe, expect, it } from "vitest";
import { tableKey } from "../src/deck/catalog";
import {
	blocksForTable,
	repairTableLayouts,
	resolveTableLayouts,
	tableLayoutOf,
} from "../src/deck/layouts";
import { createDeck } from "../src/settings/defaults";
import { createBlock, type CardBlock, type Deck, type TableCatalogItem } from "../src/model";

function key(path: string, headers: string[], occurrence = 0): string {
	return tableKey(path, { headerSignature: headers.join("\u001f"), occurrence });
}

function catalogItem(path: string, headers: string[], occurrence = 0): TableCatalogItem {
	return {
		key: key(path, headers, occurrence),
		selector: { headerSignature: headers.join("\u001f"), occurrence },
		sourcePath: path,
		sourceIds: ["source-1"],
		label: headers[0] ?? "Table",
		tableNumber: occurrence + 1,
		headingPath: [],
		headers: headers.slice(),
		rowCount: 3,
	};
}

function deckWith(layouts: Deck["tableLayouts"], blocks: CardBlock[] = [createBlock({ columns: ["word"] })]): Deck {
	return createDeck({ name: "Mixed", blocks, tableLayouts: layouts });
}

const VOCAB = ["word", "translation", "example"];
const SPENDING = ["date", "amount", "category"];

describe("per-table layouts", () => {
	it("falls back to the deck layout for a table without its own", () => {
		const deck = deckWith([]);
		expect(blocksForTable(deck, key("Vocab.md", VOCAB))).toBe(deck.blocks);
	});

	it("uses the table layout when one exists", () => {
		const own = [createBlock({ kind: "title", columns: ["amount"] })];
		const deck = deckWith([{ tableKey: key("Money.md", SPENDING), label: "Spending", blocks: own }]);
		expect(blocksForTable(deck, key("Money.md", SPENDING))).toEqual(own);
		expect(blocksForTable(deck, key("Vocab.md", VOCAB))).toBe(deck.blocks);
	});

	it("reports whether a table carries its own layout", () => {
		const deck = deckWith([{ tableKey: key("Money.md", SPENDING), label: "Spending", blocks: [] }]);
		expect(tableLayoutOf(deck, key("Money.md", SPENDING))?.label).toBe("Spending");
		expect(tableLayoutOf(deck, key("Vocab.md", VOCAB))).toBeNull();
	});

	it("follows a table that gained a column", () => {
		const own = [createBlock({ kind: "title", columns: ["amount"] })];
		const deck = deckWith([{ tableKey: key("Money.md", SPENDING), label: "Spending", blocks: own }]);
		const live = [catalogItem("Money.md", [...SPENDING, "note"])];

		const resolved = resolveTableLayouts(deck, live);

		expect(resolved.get(live[0]!.key)).toEqual(own);
	});

	it("never binds two layouts to the same live table", () => {
		const first = [createBlock({ kind: "title", columns: ["amount"] })];
		const second = [createBlock({ kind: "note", columns: ["category"] })];
		const deck = deckWith([
			{ tableKey: key("Money.md", SPENDING, 0), label: "First", blocks: first },
			{ tableKey: key("Money.md", SPENDING, 1), label: "Second", blocks: second },
		]);
		const live = [catalogItem("Money.md", [...SPENDING, "note"], 0)];

		const resolved = resolveTableLayouts(deck, live);

		expect(resolved.size).toBe(1);
		expect(resolved.get(live[0]!.key)).toEqual(first);
	});

	it("leaves a layout alone while its note is unavailable", () => {
		const own = [createBlock({ kind: "title", columns: ["amount"] })];
		const deck = deckWith([{ tableKey: key("Money.md", SPENDING), label: "Spending", blocks: own }]);

		const repaired = repairTableLayouts(deck, [catalogItem("Vocab.md", VOCAB)]);

		expect(repaired.changed).toBe(false);
		expect(repaired.layouts).toEqual(deck.tableLayouts);
	});

	it("rewrites a moved key and refreshes the stored label", () => {
		const own = [createBlock({ kind: "title", columns: ["amount"] })];
		const deck = deckWith([{ tableKey: key("Money.md", SPENDING), label: "stale", blocks: own }]);
		const live = [catalogItem("Money.md", [...SPENDING, "note"])];

		const repaired = repairTableLayouts(deck, live);

		expect(repaired.changed).toBe(true);
		expect(repaired.layouts[0]?.tableKey).toBe(live[0]!.key);
		expect(repaired.layouts[0]?.label).toBe(live[0]!.label);
		expect(repaired.layouts[0]?.blocks).toEqual(own);
	});

	it("keeps an exact match untouched", () => {
		const deck = deckWith([{ tableKey: key("Money.md", SPENDING), label: "date", blocks: [] }]);

		expect(repairTableLayouts(deck, [catalogItem("Money.md", SPENDING)]).changed).toBe(false);
	});
});
