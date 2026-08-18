import { describe, expect, it } from "vitest";
import { createBlock } from "../src/model";
import { DEFAULT_SETTINGS, mergeDeck, mergeSettings } from "../src/settings/defaults";
import {
	defaultAppearance,
	mergeAppearance,
	resolveDeckAppearance,
} from "../src/settings/appearance";
import { contrastGrade, contrastRatio } from "../src/ui/editor/controls/ColorField";

describe("settings merge", () => {
	it("migrates a v2 single table into an include selection", () => {
		const settings = mergeSettings({
			schemaVersion: 2,
			locale: "ru",
			lastDeckId: "words",
			decks: [{
				id: "words",
				name: "Words",
				enabled: true,
				sources: [{
					id: "source",
					kind: "file",
					path: "words.md",
					table: { mode: "single", selector: { headerSignature: "term\u001fru", occurrence: 1 } },
				}],
				blocks: [],
			}],
			perDeck: { words: { index: 7, shuffle: true, seed: 42 } },
		});

		expect(settings.schemaVersion).toBe(3);
		expect(settings.setupVersion).toBe(1);
		expect(settings.decks[0]?.sources[0]?.tables).toEqual({
			mode: "include",
			selectors: [{ headerSignature: "term\u001fru", occurrence: 1 }],
		});
		expect(settings.decks[0]?.ribbon.visible).toBe(true);
		expect(settings.perDeck.words).toMatchObject({
			index: 7,
			shuffle: true,
			seed: 42,
			scope: { mode: "all" },
			cardKey: null,
		});
	});

	it("preserves representative v2 deck, block, appearance, source, locale, and progress values", () => {
		const settings = mergeSettings({
			schemaVersion: 2,
			locale: "ru",
			lastDeckId: "study",
			appearance: { preset: "monochrome", cardBackground: "#101010", radius: 18 },
			decks: [{
				id: "study",
				name: "Study",
				enabled: true,
				sources: [
					{ id: "all", kind: "folder", path: "notes", table: { mode: "all" } },
					{ id: "one", kind: "file", path: "words.md", table: { mode: "single", selector: { headerSignature: "term\u001fru", occurrence: 2 } } },
				],
				blocks: [{
					id: "term",
					kind: "title",
					columns: ["Term"],
					visible: false,
					showLabel: true,
					label: "Prompt",
					combine: "firstNonEmpty",
					width: "half",
					mobile: "compact",
					height: { mode: "fixed", valuePx: 120 },
					overflow: { mode: "ellipsis", minFontPx: 15, maxLines: 2 },
					empty: { mode: "custom", customText: "—", emptyTokens: ["", "n/a"], required: true },
					appearance: { inherit: false, background: "#101010", text: "#eeeeee", radius: 12, align: "center" },
				}],
				columnTypes: { Term: "text" },
				appearance: { preset: "custom", cardBackground: "#121212", radius: 20 },
				shuffleDefault: true,
			}],
			perDeck: { study: { index: 4, shuffle: true, seed: 99 } },
		});

		expect(settings.locale).toBe("ru");
		expect(settings.appearance).toMatchObject({ preset: "monochrome", cardBackground: "#101010", radius: 18 });
		expect(settings.decks[0]).toMatchObject({
			id: "study",
			name: "Study",
			enabled: true,
			columnTypes: { Term: "text" },
			appearance: { preset: "custom", cardBackground: "#121212", radius: 20 },
			shuffleDefault: true,
			sources: [
				{ id: "all", kind: "folder", path: "notes", tables: { mode: "all" } },
				{ id: "one", kind: "file", path: "words.md", tables: { mode: "include", selectors: [{ headerSignature: "term\u001fru", occurrence: 2 }] } },
			],
		});
		expect(settings.decks[0]?.blocks[0]).toMatchObject({
			id: "term",
			kind: "title",
			columns: ["Term"],
			visible: false,
			showLabel: true,
			label: "Prompt",
			combine: "firstNonEmpty",
			width: "half",
			mobile: "compact",
			height: { mode: "fixed", valuePx: 120 },
			overflow: { mode: "ellipsis", minFontPx: 15, maxLines: 2 },
			empty: { mode: "custom", customText: "—", emptyTokens: ["", "n/a"], required: true },
			appearance: { inherit: false, background: "#101010", text: "#eeeeee", radius: 12, align: "center" },
		});
		expect(settings.perDeck.study).toMatchObject({ index: 4, shuffle: true, seed: 99, scope: { mode: "all" }, cardKey: null });
	});

	it("creates an empty first-run state only when persisted data is absent", () => {
		const fresh = mergeSettings(null);
		expect(fresh).toMatchObject({ schemaVersion: 3, setupVersion: 0, decks: [] });
		expect(mergeSettings({})).toMatchObject({ schemaVersion: 3, setupVersion: 1 });
	});

	it("keeps a v3 explicit empty table selection and is idempotent", () => {
		const once = mergeSettings({
			schemaVersion: 3,
			setupVersion: 1,
			decks: [{
				id: "x",
				name: "X",
				sources: [{ id: "s", kind: "file", path: "x.md", tables: { mode: "include", selectors: [] } }],
				blocks: [],
				ribbon: { visible: true, icon: "brain" },
			}],
		});
		expect(once.decks[0]?.sources[0]?.tables).toEqual({ mode: "include", selectors: [] });
		expect(mergeSettings(once)).toEqual(once);
	});

	it("migrates v1 faces and slots into ordered v3 blocks", () => {
		const settings = mergeSettings({
			locale: "ru",
			decks: [
				{
					id: "legacy",
					name: "Legacy",
					files: ["Dictionary.md"],
					folders: ["English"],
					blocks: [
						{
							id: "word",
							style: "title",
							face: "front",
							column: "main",
							columns: ["Words"],
							visible: true,
						},
						{
							id: "translation",
							style: "text",
							face: "back",
							column: "full",
							columns: ["Translation"],
							visible: true,
						},
					],
				},
			],
		});

		expect(settings.schemaVersion).toBe(3);
		expect(settings.decks[0]?.sources).toEqual([
			expect.objectContaining({ kind: "file", path: "Dictionary.md", tables: { mode: "all" } }),
			expect.objectContaining({ kind: "folder", path: "English", tables: { mode: "all" } }),
		]);
		expect(settings.decks[0]?.blocks.map((block) => [block.kind, block.width])).toEqual([
			["title", "half"],
			["text", "full"],
		]);
		expect(settings.decks[0]?.blocks.every((block) => !("face" in block))).toBe(true);
	});

	it("is idempotent after schema version 3", () => {
		const once = mergeSettings({ decks: [{ id: "x", name: "X", files: ["x.md"] }] });
		expect(mergeSettings(once)).toEqual(once);
	});

	it("migrates old field maps into blocks", () => {
		const settings = mergeSettings({
			locale: "ru",
			decks: [
				{
					id: "verbs",
					name: "Verbs",
					files: ["verbs.md"],
					fields: {
						word: { columns: ["V1"], face: "front", visible: true, order: 0 },
						translation: { columns: ["RU"], face: "back", visible: true, order: 1 },
					},
				},
			],
		});
		expect(settings.locale).toBe("ru");
		expect(settings.decks).toHaveLength(1);
		const columns = settings.decks[0]?.blocks.flatMap((block) => block.columns) ?? [];
		expect(columns).toContain("V1");
		expect(columns).toContain("RU");
	});

	it("migrates a standalone legacy deck", () => {
		const deck = mergeDeck({ id: "legacy", name: "Legacy", files: ["legacy.md"] });
		expect(deck.sources).toEqual([
			expect.objectContaining({ kind: "file", path: "legacy.md", tables: { mode: "all" } }),
		]);
	});

	it("does not mutate the default object", () => {
		const first = DEFAULT_SETTINGS.decks.length;
		mergeSettings({ decks: [{ id: "x", name: "X" }] });
		expect(DEFAULT_SETTINGS.decks).toHaveLength(first);
	});

	it("keeps explicit blocks from new data", () => {
		const settings = mergeSettings({
			decks: [
				{
					id: "custom",
					name: "Custom",
					blocks: [{ id: "b1", style: "title", face: "front", column: "main", columns: ["Term"], visible: true }],
				},
			],
		});
		expect(settings.decks[0]?.blocks).toHaveLength(1);
		expect(settings.decks[0]?.blocks[0]?.columns).toEqual(["Term"]);
	});
});

describe("appearance", () => {
	it("inherits global appearance and applies a deck override", () => {
		const defaults = defaultAppearance();
		const resolved = resolveDeckAppearance(defaults, {
			preset: "monochrome",
			cardBackground: "#181818",
			radius: 18,
		});
		expect(resolved.cardBackground).toBe("#181818");
		expect(resolved.radius).toBe(18);
		expect(resolved.gap).toBe(defaults.gap);
		expect(resolved.preset).toBe("monochrome");
	});

	it("rejects invalid persisted colors", () => {
		expect(mergeAppearance({ cardBackground: "javascript:bad" }).cardBackground).toBe(
			defaultAppearance().cardBackground,
		);
		expect(mergeAppearance({ cardBackground: "#12abEF" }).cardBackground).toBe("#12abEF");
	});

	it("clamps max width and keeps all required color tokens", () => {
		const appearance = mergeAppearance({ maxWidth: 9999 });
		expect(appearance.maxWidth).toBe(1400);
		expect(appearance).toMatchObject({
			windowBackground: expect.stringMatching(/^#[0-9a-f]{6}$/i),
			cardBackground: expect.stringMatching(/^#[0-9a-f]{6}$/i),
			primaryText: expect.stringMatching(/^#[0-9a-f]{6}$/i),
			borderColor: expect.stringMatching(/^#[0-9a-f]{6}$/i),
		});
	});

	it("calculates WCAG contrast ratios", () => {
		expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
		expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
	});

	it("grades normal and large text independently", () => {
		expect(contrastGrade(7, false)).toBe("aaa");
		expect(contrastGrade(4.5, false)).toBe("aa");
		expect(contrastGrade(3.2, false)).toBe("fail");
		expect(contrastGrade(3.2, true)).toBe("aa");
	});

	it("normalizes an undefined block inheritance flag", () => {
		const block = createBlock({
			appearance: { inherit: undefined },
		} as Parameters<typeof createBlock>[0]);
		expect(block.appearance.inherit).toBe(true);
	});
});
