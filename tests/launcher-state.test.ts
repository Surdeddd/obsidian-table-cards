import { describe, expect, it } from "vitest";
import {
	canStartSession,
	createLauncherState,
	launcherCards,
	launcherWarningCount,
	reduceLauncherState,
	selectedTableCount,
	selectedTableKeys,
	type LauncherState,
} from "../src/session/launcher-state";
import type { DeckLoadResult, StudyScope } from "../src/model";
import { parseCell } from "../src/parse/tables";
import { createDeck } from "../src/settings/defaults";

const decks = [createDeck({ id: "verbs", name: "Verbs" }), createDeck({ id: "phrases", name: "Phrases" })];
const result: DeckLoadResult = {
	cards: [
		{
			cells: { Value: parseCell("remain") },
			headers: ["Value"],
			origin: {
				tableKey: "verbs",
				tableLabel: "Verbs",
				tableNumber: 1,
				sourcePath: "verbs.md",
				rowNumber: 3,
				rowKey: "verbs:remain",
			},
		},
		{
			cells: { Value: parseCell("cat") },
			headers: ["Value"],
			origin: {
				tableKey: "nouns",
				tableLabel: "Nouns",
				tableNumber: 1,
				sourcePath: "nouns.md",
				rowNumber: 3,
				rowKey: "nouns:cat",
			},
		},
	],
	tables: [],
	catalog: [
		{
			key: "verbs",
			selector: { headerSignature: "verbs", occurrence: 0 },
			sourcePath: "verbs.md",
			sourceIds: ["verbs"],
			label: "Verbs",
			tableNumber: 1,
			headingPath: ["Verbs"],
			headers: ["Value"],
			rowCount: 1,
		},
		{
			key: "nouns",
			selector: { headerSignature: "nouns", occurrence: 0 },
			sourcePath: "nouns.md",
			sourceIds: ["nouns"],
			label: "Nouns",
			tableNumber: 1,
			headingPath: ["Nouns"],
			headers: ["Value"],
			rowCount: 1,
		},
	],
	profiles: [],
	diagnostics: [
		{ code: "brokenImage", sourcePath: "verbs.md", detail: "missing.png" },
	],
};

function initialState(): LauncherState {
	return createLauncherState(decks, { deckId: "verbs", lockedDeck: false });
}

function loadedState(scope: StudyScope = { mode: "all" }): LauncherState {
	const loading = reduceLauncherState(initialState(), { type: "loading", deckId: "verbs", requestId: 1 });
	return reduceLauncherState(loading, {
		type: "loaded",
		deckId: "verbs",
		requestId: 1,
		result,
		savedScope: scope,
	});
}

describe("launcher state", () => {
	it("locks a ribbon launch to its requested deck", () => {
		const state = createLauncherState(decks, { deckId: "verbs", lockedDeck: true });
		const attempted = reduceLauncherState(state, { type: "selectDeck", deckId: "phrases" });
		expect(attempted).toBe(state);
		expect(attempted.deckId).toBe("verbs");
		expect(attempted.lockedDeck).toBe(true);
	});

	it("shows a deck-unavailable error for a locked missing deck", () => {
		const state = createLauncherState(decks, { deckId: "gone", lockedDeck: true });
		expect(state).toMatchObject({
			phase: "error",
			deckId: "gone",
			lockedDeck: true,
			error: { code: "deckUnavailable" },
		});
	});

	it("returns a loaded launcher to deck-unavailable when the confirmed deck disappears", () => {
		const state = loadedState({ mode: "tables", tableKeys: ["verbs"] });
		const unavailable = reduceLauncherState(state, { type: "unavailable", deckId: "verbs" });

		expect(unavailable).toMatchObject({
			phase: "error",
			deckId: "verbs",
			deck: state.deck,
			scope: { mode: "tables", tableKeys: ["verbs"] },
			result: null,
			error: { code: "deckUnavailable" },
		});
	});

	it("uses an override deck even when settings do not contain it", () => {
		const preview = createDeck({ id: "preview", name: "Preview", enabled: false });
		const state = createLauncherState(decks, {
			deckId: "not-used",
			lockedDeck: true,
			deckOverride: preview,
		});
		expect(state.deckId).toBe("preview");
		expect(state.deck).toBe(preview);
		expect(state.phase).toBe("loading");
	});

	it("defaults progress persistence and respects an explicit transient override", () => {
		expect(createLauncherState(decks, { lockedDeck: false }).persistProgress).toBe(true);
		expect(createLauncherState(decks, { lockedDeck: false, persistProgress: false }).persistProgress).toBe(false);
	});

	it("restores valid saved tables but never auto-starts", () => {
		const state = reduceLauncherState(initialState(), { type: "loading", deckId: "verbs", requestId: 1 });
		const loaded = reduceLauncherState(state, {
			type: "loaded",
			deckId: "verbs",
			requestId: 1,
			result,
			savedScope: { mode: "tables", tableKeys: ["verbs", "gone"] },
		});
		expect(loaded.scope).toEqual({ mode: "tables", tableKeys: ["verbs"] });
		expect(loaded.phase).toBe("choose");
		expect(canStartSession(loaded)).toBe(true);
	});

	it("uses an explicit request scope once before persisted progress", () => {
		const initial = createLauncherState(decks, {
			deckId: "verbs",
			lockedDeck: true,
			initialScope: { mode: "tables", tableKeys: ["nouns"] },
		});
		const loading = reduceLauncherState(initial, { type: "loading", deckId: "verbs", requestId: 1 });
		const first = reduceLauncherState(loading, {
			type: "loaded",
			deckId: "verbs",
			requestId: 1,
			result,
			savedScope: { mode: "tables", tableKeys: ["verbs"] },
		});
		expect(first.scope).toEqual({ mode: "tables", tableKeys: ["nouns"] });
		expect(first.initialScope).toBeNull();

		const retry = reduceLauncherState(first, { type: "loading", deckId: "verbs", requestId: 2 });
		const second = reduceLauncherState(retry, {
			type: "loaded",
			deckId: "verbs",
			requestId: 2,
			result,
			savedScope: { mode: "tables", tableKeys: ["verbs"] },
		});
		expect(second.scope).toEqual({ mode: "tables", tableKeys: ["verbs"] });
	});

	it("clears an initial scope when an unlocked launcher changes deck", () => {
		const state = createLauncherState(decks, {
			deckId: "verbs",
			lockedDeck: false,
			initialScope: { mode: "tables", tableKeys: ["nouns"] },
		});
		const changed = reduceLauncherState(state, { type: "selectDeck", deckId: "phrases" });
		expect(changed).toMatchObject({ deckId: "phrases", phase: "loading", initialScope: null });
	});

	it("clear creates an explicit empty selection and disables start", () => {
		const cleared = reduceLauncherState(loadedState(), { type: "clearTables" });
		expect(cleared.scope).toEqual({ mode: "tables", tableKeys: [] });
		expect(launcherCards(cleared)).toEqual([]);
		expect(canStartSession(cleared)).toBe(false);
	});

	it("unchecking from all materializes the remaining catalog keys", () => {
		const state = reduceLauncherState(loadedState({ mode: "all" }), { type: "toggleTable", tableKey: "verbs" });
		expect(state.scope).toEqual({ mode: "tables", tableKeys: ["nouns"] });
	});

	it("derives selected counts, cards, and warnings without duplicating them in state", () => {
		const state = loadedState({ mode: "tables", tableKeys: ["nouns"] });
		expect(selectedTableKeys(state)).toEqual(["nouns"]);
		expect(selectedTableCount(state)).toBe(1);
		expect(launcherCards(state)).toEqual([result.cards[1]]);
		expect(launcherWarningCount(state)).toBe(1);
	});

	it("discards stale asynchronous success and failure by exact object identity", () => {
		const current = reduceLauncherState(initialState(), { type: "loading", deckId: "phrases", requestId: 2 });
		expect(reduceLauncherState(current, {
			type: "loaded",
			deckId: "verbs",
			requestId: 1,
			result,
			savedScope: { mode: "all" },
		})).toBe(current);
		expect(reduceLauncherState(current, {
			type: "failed",
			deckId: "phrases",
			requestId: 1,
			detail: "old request",
		})).toBe(current);
	});

	it("invalidates a load when an unlocked launcher leaves and returns to its deck", () => {
		const loadingA = reduceLauncherState(initialState(), { type: "loading", deckId: "verbs", requestId: 1 });
		const loadingB = reduceLauncherState(loadingA, { type: "selectDeck", deckId: "phrases" });
		const returnedToA = reduceLauncherState(loadingB, { type: "selectDeck", deckId: "verbs" });

		expect(returnedToA.requestId).not.toBe(1);
		expect(reduceLauncherState(returnedToA, {
			type: "loaded",
			deckId: "verbs",
			requestId: 1,
			result,
			savedScope: { mode: "all" },
		})).toBe(returnedToA);
		expect(reduceLauncherState(returnedToA, {
			type: "failed",
			deckId: "verbs",
			requestId: 1,
			detail: "old request",
		})).toBe(returnedToA);

		const fresh = reduceLauncherState(returnedToA, {
			type: "loading",
			deckId: "verbs",
			requestId: returnedToA.requestId + 1,
		});
		const loaded = reduceLauncherState(fresh, {
			type: "loaded",
			deckId: "verbs",
			requestId: fresh.requestId,
			result,
			savedScope: { mode: "all" },
		});
		expect(loaded.phase).toBe("choose");
	});

	it("keeps object identity for ignored selections and table actions", () => {
		const loading = initialState();
		expect(reduceLauncherState(loading, { type: "selectDeck", deckId: "verbs" })).toBe(loading);
		expect(reduceLauncherState(loading, { type: "toggleTable", tableKey: "verbs" })).toBe(loading);

		const loaded = loadedState();
		expect(reduceLauncherState(loaded, { type: "toggleTable", tableKey: "missing" })).toBe(loaded);
		expect(reduceLauncherState(loaded, { type: "selectAllTables" })).toBe(loaded);
	});
});
