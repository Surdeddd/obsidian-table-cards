import { filterCardsByScope, restoreCardIndex } from "../deck/filter";
import { shuffleItems } from "../deck/shuffle";
import type { Card, StudyScope } from "../model";

export interface StudyCardSelectionOptions {
	allCards: Card[];
	scope: StudyScope;
	shuffle: boolean;
	seed: number;
	cardKey: string | null;
	fallbackIndex: number;
}

export interface StudyCardSelection {
	cards: Card[];
	index: number;
	cardKey: string | null;
}

export function findExactCardIndex(cards: Card[], rowKey: string): number {
	return cards.findIndex((card) => card.origin.rowKey === rowKey);
}

export function selectStudyCards(options: StudyCardSelectionOptions): StudyCardSelection {
	const scoped = filterCardsByScope(options.allCards, options.scope);
	const cards = options.shuffle ? shuffleItems(scoped, options.seed) : scoped;
	const index = restoreCardIndex(cards, options.cardKey, options.fallbackIndex);
	return { cards, index, cardKey: cards[index]?.origin.rowKey ?? null };
}
