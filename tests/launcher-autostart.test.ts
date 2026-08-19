import { describe, expect, it } from "vitest";
import { createLauncherState, reduceLauncherState, shouldAutoStart } from "../src/session/launcher-state";
import type { Deck, DeckLoadResult } from "../src/model";
import { createDeck } from "../src/settings/defaults";

function deck(id: string, name: string): Deck {
	return { ...createDeck({ name, blocks: [] }), id };
}

const RESULT: DeckLoadResult = {
	cards: [
		{
			cells: {},
			origin: { sourceId: "s", path: "Vocab.md", tableKey: "Vocab.md#0", rowKey: "Vocab.md#0#0", rowIndex: 0 },
		} as unknown as DeckLoadResult["cards"][number],
	],
	tables: [],
	catalog: [
		{ key: "Vocab.md#0", label: "Vocabulary", path: "Vocab.md" } as unknown as DeckLoadResult["catalog"][number],
	],
	profiles: [],
	diagnostics: [],
};

function loaded(state: ReturnType<typeof createLauncherState>) {
	return reduceLauncherState(state, {
		type: "loaded",
		deckId: state.deckId ?? "",
		requestId: state.requestId,
		result: RESULT,
		savedScope: { mode: "all" },
	});
}

describe("launcher auto start", () => {
	it("starts straight away for the only deck", () => {
		const state = loaded(createLauncherState([deck("a", "Vocab")], { lockedDeck: false }));

		expect(shouldAutoStart(state, { hasLastDeck: false })).toBe(true);
	});

	it("starts straight away for a deck opened from its ribbon icon", () => {
		const decks = [deck("a", "Vocab"), deck("b", "Facts")];
		const state = loaded(createLauncherState(decks, { lockedDeck: true, deckId: "b" }));

		expect(shouldAutoStart(state, { hasLastDeck: false })).toBe(true);
	});

	it("starts straight away when a deck was studied before", () => {
		const decks = [deck("a", "Vocab"), deck("b", "Facts")];
		const state = loaded(createLauncherState(decks, { lockedDeck: false }));

		expect(shouldAutoStart(state, { hasLastDeck: true })).toBe(true);
	});

	it("asks once when several decks exist and none was ever opened", () => {
		const decks = [deck("a", "Vocab"), deck("b", "Facts")];
		const state = loaded(createLauncherState(decks, { lockedDeck: false }));

		expect(shouldAutoStart(state, { hasLastDeck: false })).toBe(false);
	});

	it("never starts before the deck has loaded", () => {
		const state = createLauncherState([deck("a", "Vocab")], { lockedDeck: false });

		expect(shouldAutoStart(state, { hasLastDeck: true })).toBe(false);
	});

	it("never starts when the scope holds no card", () => {
		const state = reduceLauncherState(createLauncherState([deck("a", "Vocab")], { lockedDeck: false }), {
			type: "loaded",
			deckId: "a",
			requestId: 0,
			result: { ...RESULT, cards: [] },
			savedScope: { mode: "all" },
		});

		expect(shouldAutoStart(state, { hasLastDeck: true })).toBe(false);
	});
});
