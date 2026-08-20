import { describe, expect, it, vi } from "vitest";
import type { ColumnProfile, DeckLoadResult, DeckSource } from "../src/model";
import { parseCell } from "../src/parse/tables";
import { mergeSettings } from "../src/settings/defaults";
import {
	canFinishSetup,
	canAdvanceSetup,
	createSetupState,
	finishSetup,
	reduceSetupState,
	shouldAutoOpenSetup,
	shouldOpenSetupForCards,
	everyDeckOff,
	type SetupState,
} from "../src/setup/state";
import { SetupScanCache, sourceTopologyKey } from "../src/setup/scan-cache";

const profiles: ColumnProfile[] = [
	{ header: "Word", inferredType: "text", confidence: 1, total: 1, nonEmpty: 1, unique: 1, samples: ["remain"], warnings: [] },
	{ header: "Translation", inferredType: "text", confidence: 1, total: 1, nonEmpty: 1, unique: 1, samples: ["оставаться"], warnings: [] },
];

function source(path: string): DeckSource {
	return { id: `source-${path}`, kind: "file", path, tables: { mode: "all" } };
}

const setupResult: DeckLoadResult = {
	cards: [{
		cells: { Word: parseCell("remain"), Translation: parseCell("оставаться") },
		headers: ["Word", "Translation"],
		origin: { tableKey: "words", tableLabel: "Words", tableNumber: 1, sourcePath: "words.md", rowNumber: 3, rowKey: "words:remain" },
	}],
	tables: [],
	catalog: [{ key: "words", selector: { headerSignature: "word", occurrence: 0 }, sourcePath: "words.md", sourceIds: ["source-words.md"], label: "Words", tableNumber: 1, headingPath: ["Words"], headers: ["Word", "Translation"], rowCount: 1 }],
	profiles,
	diagnostics: [],
};

function completeSetupState(): SetupState {
	return {
		...createSetupState(),
		step: "finish",
		sources: [source("words.md")],
		result: setupResult,
		presetId: "vocabulary",
		deckName: "English words",
		ribbonVisible: true,
		ribbonIcon: "languages",
		dirty: true,
	};
}

describe("setup draft", () => {
	it("keeps source and preset changes inside a draft", () => {
		const initial = createSetupState();
		const withSource = reduceSetupState(initial, { type: "replaceSources", sources: [source("words.md")] });
		const withPreset = reduceSetupState(withSource, { type: "selectPreset", presetId: "vocabulary" });
		expect(initial.sources).toEqual([]);
		expect(withPreset).toMatchObject({ step: "data", presetId: "vocabulary" });
	});

	it("requires source, table, valid card, preset, and name before finish", () => {
		expect(canFinishSetup(createSetupState())).toBe(false);
		expect(canFinishSetup(completeSetupState())).toBe(true);
		expect(canFinishSetup({ ...completeSetupState(), result: { ...setupResult, catalog: [] } })).toBe(false);
		expect(canFinishSetup({ ...completeSetupState(), result: { ...setupResult, cards: [] } })).toBe(false);
		expect(canFinishSetup({ ...completeSetupState(), deckName: "  " })).toBe(false);
		expect(canFinishSetup({
			...completeSetupState(),
			result: {
				...setupResult,
				cards: [{
					...setupResult.cards[0]!,
					cells: { Word: parseCell(""), Translation: parseCell("оставаться") },
				}],
			},
		})).toBe(false);
	});

	it("only moves forward when the current step is complete", () => {
		const empty = reduceSetupState(createSetupState(), { type: "next" });
		expect(empty.step).toBe("data");

		const selected = reduceSetupState(createSetupState(), { type: "replaceSources", sources: [source("words.md")] });
		const loaded = reduceSetupState(selected, { type: "replaceResult", result: setupResult, scan: null });
		const preset = reduceSetupState(reduceSetupState(loaded, { type: "next" }), { type: "selectPreset", presetId: "vocabulary" });
		expect(reduceSetupState(preset, { type: "next" }).step).toBe("finish");
		expect(reduceSetupState({ ...preset, step: "finish" }, { type: "back" }).step).toBe("preset");
	});

	it("does not advance from preset when its required blocks reject every row", () => {
		const invalid = {
			...completeSetupState(),
			step: "preset" as const,
			result: {
				...setupResult,
				cards: [{
					...setupResult.cards[0]!,
					cells: { Word: parseCell(""), Translation: parseCell("оставаться") },
				}],
			},
		};
		expect(canAdvanceSetup(invalid)).toBe(false);
		expect(reduceSetupState(invalid, { type: "next" })).toBe(invalid);
	});

	it("invalidates A immediately when topology B starts and remains unusable after B fails", () => {
		const stateA = { ...completeSetupState(), step: "data" as const, scan: { tables: [], diagnostics: [] } };
		const sourceB = source("other.md");
		const replaced = reduceSetupState(stateA, { type: "replaceSources", sources: [sourceB] });
		expect(replaced.result).toBeNull();
		expect(canAdvanceSetup(replaced)).toBe(false);

		const loadingB = reduceSetupState(replaced, { type: "loadStarted", preserveScan: false });
		const failedB = reduceSetupState(loadingB, { type: "loadFailed" });
		expect(failedB).toMatchObject({ result: null, scan: null });
		expect(canAdvanceSetup(failedB)).toBe(false);
		expect(canFinishSetup({ ...failedB, step: "finish" })).toBe(false);
	});

	it("creates one ordinary deck and marks setup complete", () => {
		const settings = mergeSettings(null);
		const result = finishSetup(settings, completeSetupState(), profiles, { deckId: "deck-english", seed: 42 });
		expect(result.setupVersion).toBe(1);
		expect(result.decks).toHaveLength(1);
		expect(result.decks[0]).toMatchObject({
			name: "English words",
			ribbon: { visible: true, icon: "languages" },
		});
		expect(result.decks[0]?.blocks.flatMap((block) => block.columns)).toContain("Translation");
		expect(result.perDeck["deck-english"]).toEqual({
			index: 0,
			shuffle: false,
			seed: 42,
			scope: { mode: "all" },
			cardKey: null,
		});
	});

	it("appends during manual setup and never mutates the persisted settings", () => {
		const settings = mergeSettings({ schemaVersion: 3, setupVersion: 1, decks: [{ id: "old", name: "Existing" }] });
		const result = finishSetup(settings, completeSetupState(), profiles, { deckId: "new", seed: 7 });
		expect(settings.decks.map((deck) => deck.id)).toEqual(["old"]);
		expect(result.decks.map((deck) => deck.id)).toEqual(["old", "new"]);
		expect(result.lastDeckId).toBe("new");
	});

	it("auto-opens only for a fresh install and routes an empty deck list to setup", () => {
		expect(shouldAutoOpenSetup(mergeSettings(null))).toBe(true);
		expect(shouldAutoOpenSetup(mergeSettings({}))).toBe(false);
		expect(shouldOpenSetupForCards(mergeSettings({ schemaVersion: 3, setupVersion: 1, decks: [] }))).toBe(true);
		expect(shouldOpenSetupForCards(mergeSettings({
			schemaVersion: 3,
			setupVersion: 1,
			decks: [{ id: "disabled", name: "Disabled", enabled: false }],
		}))).toBe(false);
		expect(shouldOpenSetupForCards(mergeSettings({
			schemaVersion: 3,
			setupVersion: 1,
			decks: [{ id: "enabled", name: "Enabled", enabled: true }],
		}))).toBe(false);
	});

	it("separates a deck that is turned off from having no deck at all", () => {
		expect(everyDeckOff(mergeSettings({ schemaVersion: 3, setupVersion: 1, decks: [] }))).toBe(false);
		expect(everyDeckOff(mergeSettings({
			schemaVersion: 3,
			setupVersion: 1,
			decks: [{ id: "disabled", name: "Disabled", enabled: false }],
		}))).toBe(true);
		expect(everyDeckOff(mergeSettings({
			schemaVersion: 3,
			setupVersion: 1,
			decks: [
				{ id: "disabled", name: "Disabled", enabled: false },
				{ id: "enabled", name: "Enabled", enabled: true },
			],
		}))).toBe(false);
	});

	it("defaults the ribbon on only for the first deck", () => {
		expect(createSetupState(0).ribbonVisible).toBe(true);
		expect(createSetupState(1).ribbonVisible).toBe(false);
		expect(createSetupState(8).ribbonVisible).toBe(false);
	});
});

describe("setup scan cache", () => {
	it("ignores selector-only edits in the topology key", () => {
		const all = source("words.md");
		const selected: DeckSource = { ...all, tables: { mode: "include", selectors: [{ headerSignature: "word", occurrence: 0 }] } };
		expect(sourceTopologyKey([all])).toBe(sourceTopologyKey([selected]));
		expect(sourceTopologyKey([all])).not.toBe(sourceTopologyKey([{ ...all, path: "other.md" }]));
	});

	it("scans a topology once and rebuilds selector changes without another scan", async () => {
		const scan = vi.fn(async () => ({ tables: [], diagnostics: [] }));
		const build = vi.fn(() => setupResult);
		const cache = new SetupScanCache(scan, build);

		await cache.load([source("words.md")]);
		const selected: DeckSource = { ...source("words.md"), tables: { mode: "include", selectors: [] } };
		await cache.load([selected]);

		expect(scan).toHaveBeenCalledTimes(1);
		expect(build).toHaveBeenCalledTimes(2);
	});

	it("discards a stale scan result after a newer topology wins", async () => {
		let resolveOld!: (value: { tables: []; diagnostics: [] }) => void;
		const old = new Promise<{ tables: []; diagnostics: [] }>((resolve) => { resolveOld = resolve; });
		const freshScan = { tables: [], diagnostics: [] } as const;
		const scan = vi.fn()
			.mockImplementationOnce(() => old)
			.mockResolvedValueOnce(freshScan);
		const build = vi.fn((_sources, value) => value === freshScan ? setupResult : { ...setupResult, cards: [] });
		const cache = new SetupScanCache(scan, build);

		const staleLoad = cache.load([source("old.md")]);
		const freshLoad = cache.load([source("new.md")]);
		expect(await freshLoad).toMatchObject({ status: "current", result: setupResult });
		resolveOld({ tables: [], diagnostics: [] });
		expect(await staleLoad).toEqual({ status: "stale" });
	});
});
