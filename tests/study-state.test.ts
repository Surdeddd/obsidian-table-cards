import { describe, expect, it } from "vitest";
import { findExactCardIndex, selectStudyCards } from "../src/session/study-state";
import type { Card } from "../src/model";
import { parseCell } from "../src/parse/tables";

function card(tableKey: string, rowKey: string): Card {
	return {
		cells: { Value: parseCell(rowKey) },
		headers: ["Value"],
		origin: {
			tableKey,
			tableLabel: tableKey,
			tableNumber: 1,
			sourcePath: `${tableKey}.md`,
			rowNumber: 3,
			rowKey,
		},
	};
}

describe("study state", () => {
	it("preserves the current row key when it remains in the next scope", () => {
		const allCards = [card("nouns", "cat"), card("verbs", "remain"), card("verbs", "leave")];

		const selected = selectStudyCards({
			allCards,
			scope: { mode: "tables", tableKeys: ["verbs"] },
			shuffle: false,
			seed: 7,
			cardKey: "leave",
			fallbackIndex: 0,
		});

		expect(selected.cards.map((item) => item.origin.rowKey)).toEqual(["remain", "leave"]);
		expect(selected.index).toBe(1);
		expect(selected.cardKey).toBe("leave");
	});

	it("falls back to the saved index and finds only exact row keys", () => {
		const allCards = [card("nouns", "cat"), card("verbs", "remain"), card("verbs", "leave")];
		const selected = selectStudyCards({
			allCards,
			scope: { mode: "tables", tableKeys: ["nouns"] },
			shuffle: false,
			seed: 7,
			cardKey: "leave",
			fallbackIndex: 99,
		});

		expect(selected.index).toBe(0);
		expect(selected.cardKey).toBe("cat");
		expect(findExactCardIndex(allCards, "remain")).toBe(1);
		expect(findExactCardIndex(allCards, "rem")).toBe(-1);
	});
});
