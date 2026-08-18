import { describe, expect, it } from "vitest";
import { scanMarkdownTables } from "../src/parse/tables";
import {
	tableSelectedBySource,
	toggleSourceTable,
} from "../src/deck/selectors";
import type { DeckSource } from "../src/model";

const MARKDOWN = "| Term | RU |\n|---|---|\n|one|один|";

function folderSource(tables: DeckSource["tables"]): DeckSource {
	return { id: "folder", kind: "folder", path: "Folder", tables };
}

describe("table selectors", () => {
	it("deselects only one identical folder table from all and persists the other path", () => {
		const first = scanMarkdownTables(MARKDOWN, "Folder/a.md")[0]!;
		const second = scanMarkdownTables(MARKDOWN, "Folder/b.md")[0]!;
		const next = toggleSourceTable(folderSource({ mode: "all" }), [first, second], second);

		expect(next.tables).toEqual({
			mode: "include",
			selectors: [{ ...first.selector, sourcePath: "Folder/a.md" }],
		});
		expect(tableSelectedBySource(next, first)).toBe(true);
		expect(tableSelectedBySource(next, second)).toBe(false);
	});

	it("materializes a legacy pathless match before toggling one identical table", () => {
		const first = scanMarkdownTables(MARKDOWN, "Folder/a.md")[0]!;
		const second = scanMarkdownTables(MARKDOWN, "Folder/b.md")[0]!;
		const legacy = folderSource({ mode: "include", selectors: [{ ...first.selector }] });
		const next = toggleSourceTable(legacy, [first, second], second);

		expect(next.tables).toEqual({
			mode: "include",
			selectors: [{ ...first.selector, sourcePath: "Folder/a.md" }],
		});
	});

	it("adds a new folder choice with its path while file choices remain compatible", () => {
		const folderTable = scanMarkdownTables(MARKDOWN, "Folder/a.md")[0]!;
		const folder = toggleSourceTable(folderSource({ mode: "include", selectors: [] }), [folderTable], folderTable);
		expect(folder.tables).toEqual({
			mode: "include",
			selectors: [{ ...folderTable.selector, sourcePath: "Folder/a.md" }],
		});

		const fileTable = scanMarkdownTables(MARKDOWN, "cards.md")[0]!;
		const file = toggleSourceTable(
			{ id: "file", kind: "file", path: "cards.md", tables: { mode: "include", selectors: [] } },
			[fileTable],
			fileTable,
		);
		expect(file.tables).toEqual({ mode: "include", selectors: [{ ...fileTable.selector }] });
	});
});
