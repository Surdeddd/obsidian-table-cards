import { describe, expect, it, vi } from "vitest";
import { createTranslator } from "../src/i18n";
import type { LauncherState } from "../src/session/launcher-state";
import { createLauncherState, reduceLauncherState } from "../src/session/launcher-state";
import { DEFAULT_SETTINGS, createDeck } from "../src/settings/defaults";
import type { DeckLoadResult, PluginSettings, StudyScope, TableCatalogItem } from "../src/model";
import {
	SessionLauncher,
	launcherFocusIntent,
	launcherFocusOrder,
	scopeForLauncherContext,
} from "../src/ui/SessionLauncher";
import { disambiguateTableLabels } from "../src/ui/ScopePicker";

interface LauncherHarness {
	state: LauncherState;
	render: () => void;
	commitState: (next: LauncherState) => boolean;
	scopePicker: { destroy: () => void } | null;
}

function table(key: string, sourcePath: string, label = "Topic", tableNumber = 1): TableCatalogItem {
	return {
		key,
		selector: { headerSignature: key, occurrence: 0 },
		sourcePath,
		sourceIds: [key],
		label,
		tableNumber,
		headingPath: [label],
		headers: ["Value"],
		rowCount: 1,
	};
}

describe("launcher render/focus contracts", () => {
	it("does not render or close selection for stale success and failure", () => {
		const decks = [createDeck({ id: "first" }), createDeck({ id: "second" })];
		const selected = reduceLauncherState(createLauncherState(decks, { deckId: "first", lockedDeck: false }), {
			type: "selectDeck",
			deckId: "second",
		});
		const state = reduceLauncherState(selected, { type: "loading", deckId: "second", requestId: 2 });
		const result: DeckLoadResult = { cards: [], tables: [], catalog: [], profiles: [], diagnostics: [] };
		const staleStates = [
			reduceLauncherState(state, {
				type: "loaded",
				deckId: "first",
				requestId: 1,
				result,
				savedScope: { mode: "all" },
			}),
			reduceLauncherState(state, {
				type: "failed",
				deckId: "first",
				requestId: 1,
				detail: "stale",
			}),
		];
		const render = vi.fn();
		const destroyPicker = vi.fn();
		const activeElement = { id: "scope-search" };
		Object.defineProperty(globalThis, "document", {
			value: { activeElement },
			configurable: true,
		});
		const launcher = Object.create(SessionLauncher.prototype) as unknown as LauncherHarness;
		launcher.state = state;
		launcher.render = render;
		launcher.scopePicker = { destroy: destroyPicker };

		for (const stale of staleStates) expect(launcher.commitState(stale)).toBe(false);
		expect(render).not.toHaveBeenCalled();
		expect(destroyPicker).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(activeElement);
	});

	it("carries focus intent across a faster follow-up render", () => {
		expect(launcherFocusIntent(null, "retry")).toBe("retry");
		expect(launcherFocusIntent("deck", "retry")).toBe("deck");
	});

	it.each([
		["deck", "loading", ["deck", "status", "close"]],
		["retry", "loading", ["retry", "status", "deck", "close"]],
		["status", "choose", ["status", "primary", "scope", "deck", "close"]],
		["status", "error", ["status", "retry", "deck", "close"]],
	] as const)("maps %s focus through %s fallback", (intent, phase, expected) => {
		expect(launcherFocusOrder(intent, phase)).toEqual(expected);
	});
});

describe("launcher scope context", () => {
	it("keeps an explicit requested scope ahead of persisted progress on error", () => {
		const requested: StudyScope = { mode: "tables", tableKeys: ["requested"] };
		const deck = createDeck({ id: "deck" });
		const initial = createLauncherState([deck], {
			deckId: deck.id,
			lockedDeck: true,
			initialScope: requested,
		});
		const loading = reduceLauncherState(initial, { type: "loading", deckId: deck.id, requestId: 1 });
		const state = reduceLauncherState(loading, {
			type: "failed",
			deckId: deck.id,
			requestId: 1,
			detail: "offline",
		});
		const settings: PluginSettings = {
			...DEFAULT_SETTINGS,
			decks: [deck],
			perDeck: {
				[deck.id]: {
					index: 0,
					shuffle: false,
					seed: 1,
					scope: { mode: "tables", tableKeys: ["saved"] },
					cardKey: null,
				},
			},
		};

		expect(scopeForLauncherContext(state, settings)).toEqual(requested);
	});
});

describe("table label disambiguation", () => {
	it("uses the shortest unique suffix across colliding paths", () => {
		const catalog = [
			table("a", "Alpha/shared/file.md"),
			table("b", "Beta/shared/file.md"),
			table("c", "Gamma/other.md"),
		];
		const labels = disambiguateTableLabels(catalog, createTranslator("en"), "en");

		expect(labels.get("a")).toBe("Topic · Alpha/shared/file.md");
		expect(labels.get("b")).toBe("Topic · Beta/shared/file.md");
		expect(labels.get("c")).toBe("Topic · other.md");
	});

	it("lengthens only the path that can grow when one duplicate is at the root", () => {
		const labels = disambiguateTableLabels([
			table("root", "file.md"),
			table("nested", "Area/file.md"),
		], createTranslator("en"), "en");

		expect(labels.get("root")).toBe("Topic · file.md");
		expect(labels.get("nested")).toBe("Topic · Area/file.md");
	});

	it("adds localized table numbers to repeats in the same file", () => {
		const labels = disambiguateTableLabels([
			table("one", "Area/file.md", "Topic", 1),
			table("two", "Area/file.md", "topic", 2),
		], createTranslator("en"), "en");

		expect(labels.get("one")).toBe("Topic · file.md · Table 1");
		expect(labels.get("two")).toBe("topic · file.md · Table 2");
	});
});
