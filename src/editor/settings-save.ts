import { cloneJson, type Deck } from "../model";

export function mergeEditorDeck(latest: Deck, draft: Deck): Deck {
	const merged = {
		...cloneJson(latest),
		name: draft.name,
		sources: cloneJson(draft.sources),
		blocks: cloneJson(draft.blocks),
		tableLayouts: cloneJson(draft.tableLayouts),
		columnTypes: cloneJson(draft.columnTypes),
	};
	if (draft.appearance === undefined) {
		delete merged.appearance;
	} else {
		merged.appearance = cloneJson(draft.appearance);
	}
	return merged;
}
