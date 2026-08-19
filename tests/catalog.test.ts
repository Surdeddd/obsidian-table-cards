import { describe, expect, it } from "vitest";
import { canonicalizeTables, cardOrigins } from "../src/deck/catalog";
import { scanMarkdownTables } from "../src/parse/tables";

describe("canonical table catalog", () => {
	it("merges overlapping source origins into one canonical table", () => {
		const table = scanMarkdownTables("## Verbs\n| Term |\n|---|\n|remain|", "English/a.md")[0]!;
		const catalog = canonicalizeTables([
			{ sourceId: "folder", table },
			{ sourceId: "file", table },
		]);
		expect(catalog).toHaveLength(1);
		expect(catalog[0]).toMatchObject({
			label: "Verbs",
			sourceIds: ["folder", "file"],
			rowCount: 1,
			tableNumber: 1,
		});
	});

	it("keeps row keys stable when rows move", () => {
		const first = scanMarkdownTables("| A |\n|---|\n|one|\n|two|", "x.md")[0]!;
		const moved = scanMarkdownTables("| A |\n|---|\n|two|\n|one|", "x.md")[0]!;
		expect(cardOrigins(first).map((item) => item.rowKey).sort())
			.toEqual(cardOrigins(moved).map((item) => item.rowKey).sort());
	});

	it("assigns distinct deterministic keys to duplicate rows", () => {
		const table = scanMarkdownTables("| A |\n|---|\n|same|\n|same|", "x.md")[0]!;
		const origins = cardOrigins(table);
		expect(origins[0]?.rowKey).not.toBe(origins[1]?.rowKey);
		expect(cardOrigins(table).map((item) => item.rowKey)).toEqual(origins.map((item) => item.rowKey));
	});
});
