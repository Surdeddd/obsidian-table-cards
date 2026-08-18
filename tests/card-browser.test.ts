import { describe, expect, it } from "vitest";
import {
	browserResults,
	buildTableDisplayLabels,
	matchingSnippet,
	openForRender,
} from "../src/ui/card-browser-state";
import { buildSearchIndex } from "../src/deck/filter";
import type { Card, TableCatalogItem } from "../src/model";
import { parseCell } from "../src/parse/tables";

function card(tableKey: string, row: number, value: string): Card {
	return {
		cells: { Value: parseCell(value) },
		headers: ["Value"],
		origin: {
			tableKey,
			tableLabel: tableKey,
			tableNumber: 1,
			sourcePath: `${tableKey}.md`,
			rowNumber: row + 2,
			rowKey: `${tableKey}:${row}`,
		},
	};
}

function table(key: string): TableCatalogItem {
	return {
		key,
		selector: { headerSignature: key, occurrence: 0 },
		sourcePath: `${key}.md`,
		sourceIds: [key],
		label: key,
		tableNumber: 1,
		headingPath: [key],
		headers: ["Value"],
		rowCount: 120,
	};
}

describe("card browser state", () => {
	it("mounts at most 100 active-scope cards while reporting the full total", () => {
		const cards = Array.from({ length: 120 }, (_, index) => card("verbs", index, `word ${index}`));
		cards.splice(40, 0, card("nouns", 0, "excluded"));

		const results = browserResults(
			buildSearchIndex(cards),
			[table("verbs"), table("nouns")],
			{ mode: "tables", tableKeys: ["verbs"] },
			"",
		);

		expect(results.total).toBe(120);
		expect(results.shown).toBe(100);
		expect(results.groups.flatMap((group) => group.matches).map((match) => match.entry.card.origin.rowKey))
			.toEqual(Array.from({ length: 100 }, (_, index) => `verbs:${index}`));
	});

	it("starts a new group whenever the table changes in source order", () => {
		const cards = [
			card("verbs", 0, "remain"),
			card("verbs", 1, "leave"),
			card("nouns", 0, "home"),
			card("verbs", 2, "return"),
		];

		const results = browserResults(
			buildSearchIndex(cards),
			[table("verbs"), table("nouns")],
			{ mode: "all" },
			"",
		);

		expect(results.groups.map((group) => ({
			tableKey: group.tableKey,
			rowKeys: group.matches.map((match) => match.entry.card.origin.rowKey),
		}))).toEqual([
			{ tableKey: "verbs", rowKeys: ["verbs:0", "verbs:1"] },
			{ tableKey: "nouns", rowKeys: ["nouns:0"] },
			{ tableKey: "verbs", rowKeys: ["verbs:2"] },
		]);
	});

	it("keeps a long matching value compact without losing the match", () => {
		const value = `${"prefix ".repeat(30)}needle here${" suffix".repeat(30)}`;
		const candidate = card("phrases", 0, "overview");
		candidate.cells = {
			Primary: parseCell("overview"),
			FirstMatch: parseCell(value),
			LaterMatch: parseCell("another needle"),
		};
		const entry = buildSearchIndex([candidate])[0]!;

		const snippet = matchingSnippet(entry, "needle");

		expect(snippet).toContain("needle here");
		expect(snippet.startsWith("…")).toBe(true);
		expect(snippet.endsWith("…")).toBe(true);
		expect(Array.from(snippet).length).toBeLessThanOrEqual(162);
	});

	it("returns a joined fallback when the normalized match crosses cell boundaries", () => {
		const candidate = card("phrases", 0, "unused");
		candidate.cells = { First: parseCell("Hello"), Second: parseCell("world") };
		const entry = buildSearchIndex([candidate])[0]!;

		expect(entry.normalized).toContain("hello world");
		expect(matchingSnippet(entry, "hello world")).toBe("Hello world");
	});

	it("keeps matches after long collapsed whitespace", () => {
		const value = `prefix${" \n\t ".repeat(100)}Needle target`;
		const entry = buildSearchIndex([card("phrases", 0, value)])[0]!;

		expect(matchingSnippet(entry, "needle")).toContain("Needle target");
	});

	it("maps NFKD offsets back to the original text before clipping", () => {
		const value = `${"e\u0301".repeat(120)} Café target`;
		const entry = buildSearchIndex([card("phrases", 0, value)])[0]!;

		expect(matchingSnippet(entry, "cafe")).toContain("Café target");
	});

	it("falls back to the primary value when the requested query is no longer present", () => {
		const entry = buildSearchIndex([card("phrases", 0, "Primary value")])[0]!;

		expect(matchingSnippet(entry, "stale query")).toBe("Primary value");
	});

	it("ignores a result click captured by an older render", () => {
		const opened: string[] = [];

		expect(openForRender(4, 5, "stale", (rowKey) => opened.push(rowKey))).toBe(false);
		expect(openForRender(5, 5, "current", (rowKey) => opened.push(rowKey))).toBe(true);
		expect(opened).toEqual(["current"]);
	});

	it("adds a table ordinal only when one file repeats the same label", () => {
		const first = { ...table("first"), label: "Vocabulary", sourcePath: "English.md", tableNumber: 1 };
		const second = { ...table("second"), label: "Vocabulary", sourcePath: "English.md", tableNumber: 2 };
		const otherFile = { ...table("third"), label: "Vocabulary", sourcePath: "French.md", tableNumber: 1 };

		const labels = buildTableDisplayLabels([first, second, otherFile], (number) => `Table ${number}`);

		expect(Object.fromEntries(labels)).toEqual({
			first: "Vocabulary · Table 1",
			second: "Vocabulary · Table 2",
			third: "Vocabulary",
		});
	});
});
