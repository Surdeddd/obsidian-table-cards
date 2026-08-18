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
	it("migrates v1 faces and slots into ordered v2 blocks", () => {
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

		expect(settings.schemaVersion).toBe(2);
		expect(settings.decks[0]?.sources).toEqual([
			expect.objectContaining({ kind: "file", path: "Dictionary.md", table: { mode: "all" } }),
			expect.objectContaining({ kind: "folder", path: "English", table: { mode: "all" } }),
		]);
		expect(settings.decks[0]?.blocks.map((block) => [block.kind, block.width])).toEqual([
			["title", "half"],
			["text", "full"],
		]);
		expect(settings.decks[0]?.blocks.every((block) => !("face" in block))).toBe(true);
	});

	it("is idempotent after schema version 2", () => {
		const once = mergeSettings({ decks: [{ id: "x", name: "X", files: ["x.md"] }] });
		expect(mergeSettings(once)).toEqual(once);
	});

	it("keeps default decks when data is empty", () => {
		const settings = mergeSettings(null);
		expect(settings.decks.map((deck) => deck.id)).toEqual(["dictionary", "phrases"]);
		expect(settings.decks[0]?.sources[0]?.path).toContain("Dictionary.md");
		expect(settings.decks[0]?.blocks.some((block) => block.kind === "title")).toBe(true);
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
			expect.objectContaining({ kind: "file", path: "legacy.md", table: { mode: "all" } }),
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
