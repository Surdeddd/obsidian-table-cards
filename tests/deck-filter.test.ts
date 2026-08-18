import { describe, expect, it } from "vitest";
import {
	buildSearchIndex,
	filterCardsByScope,
	materializeTableScope,
	normalizeScope,
	restoreCardIndex,
	searchCards,
} from "../src/deck/filter";
import type { Card, TableCatalogItem } from "../src/model";
import { parseCell } from "../src/parse/tables";

function catalog(key: string): TableCatalogItem {
	return {
		key,
		selector: { headerSignature: key, occurrence: 0 },
		sourcePath: `${key}.md`,
		sourceIds: [key],
		label: key,
		tableNumber: 1,
		headingPath: [key],
		headers: ["Value"],
		rowCount: 1,
	};
}

function card(key: string, value: string): Card {
	return {
		cells: { Value: parseCell(value) },
		headers: ["Value"],
		origin: {
			tableKey: key,
			tableLabel: key,
			tableNumber: 1,
			sourcePath: `${key}.md`,
			rowNumber: 3,
			rowKey: `${key}:${value}`,
		},
	};
}

const cards = [card("nouns", "cat"), card("verbs", "remain"), card("nouns", "dog")];
const cardsWithText = (values: string[]): Card[] => values.map((value, index) => card(`table-${index}`, value));

describe("deck filtering", () => {
	it("distinguishes all, selected tables, and an explicit empty scope", () => {
		expect(filterCardsByScope(cards, { mode: "all" })).toHaveLength(3);
		expect(filterCardsByScope(cards, { mode: "tables", tableKeys: ["verbs"] }))
			.toEqual([cards[1]]);
		expect(filterCardsByScope(cards, { mode: "tables", tableKeys: [] })).toEqual([]);
	});

	it("materializes all tables before an individual table is unchecked", () => {
		expect(materializeTableScope({ mode: "all" }, [catalog("nouns"), catalog("verbs")]))
			.toEqual({ mode: "tables", tableKeys: ["nouns", "verbs"] });
	});

	it("matches case, accents, Cyrillic, and CJK text", () => {
		const index = buildSearchIndex(cardsWithText(["Café", "ОСТАВАТЬСЯ", "猫"]));
		expect(searchCards(index, "cafe").total).toBe(1);
		expect(searchCards(index, "оставаться").total).toBe(1);
		expect(searchCards(index, "猫").total).toBe(1);
	});

	it("restores by card key before falling back to a clamped index", () => {
		expect(restoreCardIndex(cards, cards[2]!.origin.rowKey, 0)).toBe(2);
		expect(restoreCardIndex(cards.slice(0, 2), "missing", 99)).toBe(1);
		expect(restoreCardIndex(cards.slice(0, 2), "missing", -4)).toBe(0);
		expect(restoreCardIndex([], "missing", 4)).toBe(0);
	});

	it("removes stale table keys without turning an empty explicit scope into all", () => {
		expect(normalizeScope({ mode: "tables", tableKeys: ["live", "gone"] }, [catalog("live")]))
			.toEqual({ mode: "tables", tableKeys: ["live"] });
		expect(normalizeScope({ mode: "tables", tableKeys: ["gone"] }, [catalog("live")]))
			.toEqual({ mode: "tables", tableKeys: [] });
	});
});
