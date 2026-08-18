import { cloneJson, type Deck, type ParsedTable } from "../model";
import type { DeckOpenRequest } from "../session/launcher-state";

export function exactTableOpenRequest(deck: Deck, table: ParsedTable): DeckOpenRequest {
	const deckOverride = cloneJson(deck);
	deckOverride.sources = [{
		id: "editor-preview-source",
		kind: "file",
		path: table.sourcePath,
		tables: {
			mode: "include",
			selectors: [{ ...table.selector, sourcePath: table.sourcePath }],
		},
	}];
	return {
		deckId: deckOverride.id,
		lockedDeck: true,
		deckOverride,
		initialScope: { mode: "all" },
		persistProgress: false,
	};
}
