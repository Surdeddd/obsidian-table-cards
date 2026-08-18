import { describe, expect, it, vi } from "vitest";
import { TFile, type App } from "obsidian";
import type { DeckLoadResult, DeckSource, ParsedTable } from "../src/model";
import { parseCell } from "../src/parse/tables";
import { createDeck } from "../src/settings/defaults";
import { EditorScanCache, editorSourceTopologyKey } from "../src/editor/scan-cache";
import { exactTableOpenRequest } from "../src/editor/draft-session";
import { buildDeckDataFromScan, scanDeckSources } from "../src/deck/load";

function source(path: string, tables: DeckSource["tables"] = { mode: "all" }): DeckSource {
	return { id: `source-${path}`, kind: "file", path, tables };
}

const result: DeckLoadResult = {
	cards: [],
	tables: [],
	catalog: [],
	profiles: [],
	diagnostics: [],
};

const table: ParsedTable = {
	index: 1,
	selector: { headerSignature: "term\u001ftranslation", occurrence: 0 },
	headingPath: ["Verbs"],
	headers: ["Term", "Translation"],
	rawHeaders: ["Term", "Translation"],
	rows: [{ Term: parseCell("remain"), Translation: parseCell("оставаться") }],
	rowNumbers: [7],
	sourcePath: "English/words.md",
};

describe("editor scan cache", () => {
	it("keys only source identity, kind, and normalized path as topology", () => {
		const all = { ...source("words.md"), path: " words.md " };
		const selected = source("words.md", {
			mode: "include",
			selectors: [{ headerSignature: "term", occurrence: 0 }],
		});

		expect(editorSourceTopologyKey([all])).toBe(editorSourceTopologyKey([selected]));
		expect(editorSourceTopologyKey([all])).not.toBe(
			editorSourceTopologyKey([{ ...all, id: "another-source" }]),
		);
		expect(editorSourceTopologyKey([all])).not.toBe(
			editorSourceTopologyKey([{ ...all, kind: "folder" }]),
		);
	});

	it("rescans topology changes and only rebuilds selector, block, and type edits", async () => {
		const scanResult = { tables: [], diagnostics: [] };
		const scan = vi.fn(async () => scanResult);
		const build = vi.fn(() => result);
		const cache = new EditorScanCache(scan, build);
		const initial = createDeck({ sources: [source("words.md")] });

		await cache.load(initial);
		await cache.load({
			...initial,
			sources: [source("words.md", { mode: "include", selectors: [] })],
		});
		await cache.load({ ...initial, blocks: [], columnTypes: { term: "text" } });
		await cache.load({ ...initial, sources: [source("other.md")] });

		expect(scan).toHaveBeenCalledTimes(2);
		expect(build).toHaveBeenCalledTimes(4);
	});

	it("performs zero additional vault reads for selector and draft-only rebuilds", async () => {
		const file = new TFile("words.md");
		let vaultReads = 0;
		const app = {
			vault: {
				getAbstractFileByPath: (path: string) => path === file.path ? file : null,
				cachedRead: async () => {
					vaultReads += 1;
					return "| Term | Translation |\n|---|---|\n|remain|оставаться|";
				},
			},
			metadataCache: { getFirstLinkpathDest: () => null },
		} as unknown as App;
		const cache = new EditorScanCache(
			(sources) => scanDeckSources(app, sources),
			(deck, scan) => buildDeckDataFromScan(app, deck, scan),
		);
		const deck = createDeck({ sources: [source("words.md")] });

		const first = await cache.load(deck);
		const selectorOnly = await cache.load({
			...deck,
			sources: [source("words.md", { mode: "include", selectors: [] })],
		});
		const typeOnly = await cache.load({ ...deck, columnTypes: { term: "text" } });

		expect(vaultReads).toBe(1);
		expect(first).toMatchObject({ status: "current", result: { cards: [{ headers: ["Term", "Translation"] }] } });
		expect(selectorOnly).toMatchObject({ status: "current", result: { cards: [] } });
		expect(typeOnly).toMatchObject({ status: "current", result: { cards: [{ headers: ["Term", "Translation"] }] } });
	});

	it("does not let an older async topology overwrite the latest scan", async () => {
		let resolveOld!: (value: { tables: []; diagnostics: [] }) => void;
		const old = new Promise<{ tables: []; diagnostics: [] }>((resolve) => { resolveOld = resolve; });
		const fresh = { tables: [], diagnostics: [] } as const;
		const scan = vi.fn()
			.mockImplementationOnce(() => old)
			.mockResolvedValueOnce(fresh);
		const cache = new EditorScanCache(scan, () => result);

		const stale = cache.load(createDeck({ sources: [source("old.md")] }));
		const current = cache.load(createDeck({ sources: [source("new.md")] }));
		expect(await current).toMatchObject({ status: "current", scan: fresh });
		resolveOld({ tables: [], diagnostics: [] });
		expect(await stale).toEqual({ status: "stale" });
	});
});

describe("exact-table draft session", () => {
	it("creates a locked, non-persistent request without mutating the unsaved draft", () => {
		const draft = createDeck({
			id: "draft-deck",
			name: "Unsaved name",
			sources: [source("all.md")],
			columnTypes: { term: "text" },
		});
		const before = JSON.stringify(draft);

		const request = exactTableOpenRequest(draft, table);

		expect(JSON.stringify(draft)).toBe(before);
		expect(request).toMatchObject({
			deckId: "draft-deck",
			lockedDeck: true,
			initialScope: { mode: "all" },
			persistProgress: false,
		});
		expect(request.deckOverride).not.toBe(draft);
		expect(request.deckOverride?.name).toBe("Unsaved name");
		expect(request.deckOverride?.columnTypes).toEqual({ term: "text" });
		expect(request.deckOverride?.sources).toEqual([{
			id: "editor-preview-source",
			kind: "file",
			path: "English/words.md",
			tables: {
				mode: "include",
				selectors: [{
					headerSignature: "term\u001ftranslation",
					occurrence: 0,
					sourcePath: "English/words.md",
				}],
			},
		}]);
	});
});
