import type { App } from "obsidian";
import { TFile, TFolder } from "obsidian";
import { describe, expect, it } from "vitest";
import { buildDeckDataFromScan, loadDeckData, scanDeckSources } from "../src/deck/load";
import { createBlock } from "../src/model";
import { headerSignature } from "../src/parse/tables";
import { createDeck } from "../src/settings/defaults";

const SIMPLE_TABLE = "| Term | RU |\n|---|---|\n|remain|оставаться|";
const TWO_TABLES = `${SIMPLE_TABLE}\n\n| Term | RU |\n|---|---|\n|skip|пропустить|`;

function fakeApp(
	markdownByPath: Record<string, string>,
	folders: Record<string, string[]> = {},
	images: string[] = [],
	readCount = new Map<string, number>(),
): App {
	const files = new Map<string, TFile>();
	for (const path of Object.keys(markdownByPath)) {
		files.set(path, new TFile(path));
	}
	for (const path of images) {
		files.set(path, new TFile(path));
	}
	const folderEntries = new Map<string, TFolder>();
	for (const [path, children] of Object.entries(folders)) {
		folderEntries.set(
			path,
			new TFolder(
				path,
				children.map((child) => files.get(child) ?? new TFile(child)),
			),
		);
	}
	return {
		vault: {
			getAbstractFileByPath: (path: string) => files.get(path) ?? folderEntries.get(path) ?? null,
			cachedRead: async (file: TFile) => {
				readCount.set(file.path, (readCount.get(file.path) ?? 0) + 1);
				return markdownByPath[file.path] ?? "";
			},
			getResourcePath: (file: TFile) => `app://vault/${file.path}`,
		},
		metadataCache: {
			getFirstLinkpathDest: (linkpath: string) => files.get(linkpath) ?? null,
		},
	} as unknown as App;
}

describe("deck loading", () => {
	it("loads only the saved table selection", async () => {
		const deck = createDeck({
			sources: [
				{
					id: "source-1",
					kind: "file",
					path: "two.md",
					tables: {
						mode: "include",
						selectors: [{ headerSignature: headerSignature(["Term", "RU"]), occurrence: 0 }],
					},
				},
			],
		});
		const result = await loadDeckData(fakeApp({ "two.md": TWO_TABLES }), deck);
		expect(result.cards.map((card) => card.cells.Term?.text)).toEqual(["remain"]);
		expect(result.tables).toHaveLength(1);
	});

	it("reports a missing selected table without falling back", async () => {
		const deck = createDeck({
			sources: [
				{
					id: "source-1",
					kind: "file",
					path: "x.md",
					tables: {
						mode: "include",
						selectors: [{ headerSignature: headerSignature(["Missing"]), occurrence: 0 }],
					},
				},
			],
		});
		const result = await loadDeckData(fakeApp({ "x.md": SIMPLE_TABLE }), deck);
		expect(result.cards).toEqual([]);
		expect(result.diagnostics[0]?.code).toBe("tableMissing");
	});

	it("loads direct Markdown children from folders and reports missing sources", async () => {
		const deck = createDeck({
			sources: [
				{ id: "folder", kind: "folder", path: "English", tables: { mode: "all" } },
				{ id: "missing", kind: "file", path: "gone.md", tables: { mode: "all" } },
			],
		});
		const app = fakeApp(
			{ "English/a.md": SIMPLE_TABLE, "English/ignore.txt": "not markdown" },
			{ English: ["English/a.md", "English/ignore.txt"] },
		);
		const result = await loadDeckData(app, deck);
		expect(result.cards).toHaveLength(1);
		expect(result.diagnostics).toEqual([
			expect.objectContaining({ code: "sourceMissing", sourcePath: "gone.md" }),
		]);
	});

	it("does not duplicate a table selected through overlapping sources", async () => {
		const deck = createDeck({
			sources: [
				{ id: "folder", kind: "folder", path: "English", tables: { mode: "all" } },
				{ id: "file", kind: "file", path: "English/a.md", tables: { mode: "all" } },
			],
		});
		const readCount = new Map<string, number>();
		const app = fakeApp(
			{ "English/a.md": "## Verbs\n" + SIMPLE_TABLE },
			{ English: ["English/a.md"] },
			[],
			readCount,
		);
		const result = await loadDeckData(app, deck);
		expect(readCount.get("English/a.md")).toBe(1);
		expect(result.tables).toHaveLength(1);
		expect(result.catalog[0]?.sourceIds).toEqual(["folder", "file"]);
		expect(result.cards).toHaveLength(1);
		expect(result.cards[0]?.origin).toMatchObject({
			sourcePath: "English/a.md",
			tableLabel: "Verbs",
			rowNumber: 4,
			tableNumber: 1,
		});
	});

	it("builds different selections from one scan without rereading files", async () => {
		const readCount = new Map<string, number>();
		const app = fakeApp({ "two.md": TWO_TABLES }, {}, [], readCount);
		const allDeck = createDeck({
			sources: [{ id: "source", kind: "file", path: "two.md", tables: { mode: "all" } }],
		});
		const scan = await scanDeckSources(app, allDeck.sources);
		const firstDeck = createDeck({
			sources: [{
				id: "source",
				kind: "file",
				path: "two.md",
				tables: {
					mode: "include",
					selectors: [{ headerSignature: headerSignature(["Term", "RU"]), occurrence: 0 }],
				},
			}],
		});
		const secondDeck = createDeck({
			sources: [{
				id: "source",
				kind: "file",
				path: "two.md",
				tables: {
					mode: "include",
					selectors: [{ headerSignature: headerSignature(["Term", "RU"]), occurrence: 1 }],
				},
			}],
		});

		const first = buildDeckDataFromScan(app, firstDeck, scan);
		const second = buildDeckDataFromScan(app, secondDeck, scan);

		expect(readCount.get("two.md")).toBe(1);
		expect(first.cards.map((card) => card.cells.Term?.text)).toEqual(["remain"]);
		expect(second.cards.map((card) => card.cells.Term?.text)).toEqual(["skip"]);
	});

	it("returns profiles and broken-image diagnostics", async () => {
		const markdown = "| Word | Picture |\n|---|---|\n|cat|![[assets/missing.png]]|";
		const deck = createDeck({
			sources: [{ id: "source", kind: "file", path: "cards.md", tables: { mode: "all" } }],
			columnTypes: { word: "text" },
		});
		const result = await loadDeckData(fakeApp({ "cards.md": markdown }), deck);
		expect(result.profiles.map((profile) => profile.header)).toEqual(["Word", "Picture"]);
		expect(result.diagnostics).toEqual([
			expect.objectContaining({ code: "brokenImage", sourcePath: "cards.md", rowIndex: 3 }),
		]);
	});

	it("skips required-empty rows and reports their source row", async () => {
		const markdown = "| Term | RU |\n|---|---|\n||пусто|\n|remain|оставаться|";
		const deck = createDeck({
			sources: [{ id: "source", kind: "file", path: "cards.md", tables: { mode: "all" } }],
			blocks: [
				createBlock({
					columns: ["Term"],
					empty: { mode: "hide", customText: "", emptyTokens: [""], required: true },
				}),
			],
		});
		const result = await loadDeckData(fakeApp({ "cards.md": markdown }), deck);
		expect(result.cards.map((loaded) => loaded.cells.Term?.text)).toEqual(["remain"]);
		expect(result.diagnostics).toContainEqual(
			expect.objectContaining({ code: "requiredEmpty", sourcePath: "cards.md", rowIndex: 3 }),
		);
	});

	it("does not select any table for an explicit empty include selection", async () => {
		const deck = createDeck({
			sources: [{ id: "source", kind: "file", path: "cards.md", tables: { mode: "include", selectors: [] } }],
		});
		const result = await loadDeckData(fakeApp({ "cards.md": SIMPLE_TABLE }), deck);
		expect(result.tables).toEqual([]);
		expect(result.cards).toEqual([]);
	});

	it("keeps a pinned table after a column is added to it", async () => {
		const deck = createDeck({
			sources: [{
				id: "source",
				kind: "file",
				path: "cards.md",
				tables: {
					mode: "include",
					selectors: [{ headerSignature: headerSignature(["Term", "RU"]), occurrence: 0 }],
				},
			}],
		});
		const result = await loadDeckData(
			fakeApp({ "cards.md": "| Term | RU | Note |\n|---|---|---|\n|one|один|first|" }),
			deck,
		);

		expect(result.cards.map((card) => card.cells.Term?.text)).toEqual(["one"]);
		expect(result.diagnostics.some((item) => item.code === "tableMissing")).toBe(false);
	});

	it("does not adopt an unrelated table when the pinned one disappears", async () => {
		const deck = createDeck({
			sources: [{
				id: "source",
				kind: "file",
				path: "cards.md",
				tables: {
					mode: "include",
					selectors: [{ headerSignature: headerSignature(["Term", "RU"]), occurrence: 0 }],
				},
			}],
		});
		const result = await loadDeckData(
			fakeApp({ "cards.md": "| Date | Amount | Category |\n|---|---|---|\n|1|2|3|" }),
			deck,
		);

		expect(result.cards).toEqual([]);
		expect(result.diagnostics.some((item) => item.code === "tableMissing")).toBe(true);
	});

	it("selects one path-aware table from identical folder tables", async () => {
		const deck = createDeck({
			sources: [{
				id: "folder",
				kind: "folder",
				path: "Folder",
				tables: {
					mode: "include",
					selectors: [{
						headerSignature: headerSignature(["Term", "RU"]),
						occurrence: 0,
						sourcePath: "Folder/b.md",
					}],
				},
			}],
		});
		const result = await loadDeckData(fakeApp(
			{
				"Folder/a.md": "| Term | RU |\n|---|---|\n|one|один|",
				"Folder/b.md": "| Term | RU |\n|---|---|\n|two|два|",
			},
			{ Folder: ["Folder/a.md", "Folder/b.md"] },
		), deck);

		expect(result.cards.map((card) => card.cells.Term?.text)).toEqual(["two"]);
		expect(result.catalog.map((table) => table.sourcePath)).toEqual(["Folder/b.md"]);
		expect(result.diagnostics.some((item) => item.code === "tableMissing")).toBe(false);
	});

	it("keeps a legacy folder selector pathless and matching identical tables in every file", async () => {
		const deck = createDeck({
			sources: [{
				id: "folder",
				kind: "folder",
				path: "Folder",
				tables: {
					mode: "include",
					selectors: [{ headerSignature: headerSignature(["Term", "RU"]), occurrence: 0 }],
				},
			}],
		});
		const result = await loadDeckData(fakeApp(
			{
				"Folder/a.md": "| Term | RU |\n|---|---|\n|one|один|",
				"Folder/b.md": "| Term | RU |\n|---|---|\n|two|два|",
			},
			{ Folder: ["Folder/a.md", "Folder/b.md"] },
		), deck);

		expect(result.cards.map((card) => card.cells.Term?.text)).toEqual(["one", "two"]);
		expect(result.catalog).toHaveLength(2);
	});

	it("reports a missing path-aware folder selector instead of matching another identical table", async () => {
		const deck = createDeck({
			sources: [{
				id: "folder",
				kind: "folder",
				path: "Folder",
				tables: {
					mode: "include",
					selectors: [{
						headerSignature: headerSignature(["Term", "RU"]),
						occurrence: 0,
						sourcePath: "Folder/missing.md",
					}],
				},
			}],
		});
		const result = await loadDeckData(fakeApp(
			{ "Folder/a.md": SIMPLE_TABLE },
			{ Folder: ["Folder/a.md"] },
		), deck);

		expect(result.cards).toEqual([]);
		expect(result.catalog).toEqual([]);
		expect(result.diagnostics).toContainEqual(expect.objectContaining({
			code: "tableMissing",
			sourcePath: "Folder",
			detail: expect.stringContaining("Folder/missing.md"),
		}));
	});
});
