import { cloneJson, type Deck, type DeckProgress, type PluginSettings } from "../model";

export class DeckUnavailableError extends Error {
	readonly code = "deckUnavailable";

	constructor() {
		super("Deck unavailable");
		this.name = "DeckUnavailableError";
	}
}

export function isDeckUnavailableError(error: unknown): error is DeckUnavailableError {
	return error instanceof DeckUnavailableError;
}

export function requireEnabledDeck(settings: PluginSettings, deckId: string): Deck {
	const deck = settings.decks.find((candidate) => candidate.id === deckId && candidate.enabled);
	if (!deck) throw new DeckUnavailableError();
	return deck;
}

export function saveDeckProgressIfEnabled(
	settings: PluginSettings,
	deckId: string,
	progress: DeckProgress,
): boolean {
	if (!settings.decks.some((deck) => deck.id === deckId && deck.enabled)) return false;
	settings.perDeck[deckId] = cloneJson(progress);
	return true;
}
