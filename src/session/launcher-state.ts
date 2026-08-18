import { filterCardsByScope, materializeTableScope, normalizeScope } from "../deck/filter";
import type { Card, Deck, DeckLoadResult, StudyScope, TableCatalogItem } from "../model";

export interface DeckOpenRequest {
	deckId?: string;
	lockedDeck: boolean;
	initialScope?: StudyScope;
	deckOverride?: Deck;
	persistProgress?: boolean;
}

export interface LauncherState {
	phase: "loading" | "choose" | "error";
	deckId: string | null;
	deck: Deck | null;
	decks: Deck[];
	lockedDeck: boolean;
	persistProgress: boolean;
	requestId: number;
	initialScope: StudyScope | null;
	scope: StudyScope;
	result: DeckLoadResult | null;
	error: { code: "deckUnavailable" | "loadFailed"; detail?: string } | null;
}

export type LauncherAction =
	| { type: "selectDeck"; deckId: string }
	| { type: "loading"; deckId: string; requestId: number }
	| { type: "loaded"; deckId: string; requestId: number; result: DeckLoadResult; savedScope: StudyScope }
	| { type: "failed"; deckId: string; requestId: number; detail?: string }
	| { type: "toggleTable"; tableKey: string }
	| { type: "selectAllTables" }
	| { type: "clearTables" }
	| { type: "replaceScope"; scope: StudyScope };

const ALL_SCOPE: StudyScope = { mode: "all" };

function cloneScope(scope: StudyScope): StudyScope {
	return scope.mode === "all" ? { mode: "all" } : { mode: "tables", tableKeys: scope.tableKeys.slice() };
}

function enabledDecks(decks: Deck[]): Deck[] {
	return decks.filter((deck) => deck.enabled);
}

function deckForId(state: LauncherState, deckId: string): Deck | null {
	if (state.deck?.id === deckId) {
		return state.deck;
	}
	return state.decks.find((deck) => deck.id === deckId) ?? null;
}

function sameScope(left: StudyScope, right: StudyScope): boolean {
	if (left.mode !== right.mode) return false;
	if (left.mode === "all" || right.mode === "all") return true;
	return left.tableKeys.length === right.tableKeys.length && left.tableKeys.every((key, index) => key === right.tableKeys[index]);
}

function catalogKeys(catalog: TableCatalogItem[]): string[] {
	return Array.from(new Set(catalog.map((table) => table.key)));
}

function withScope(state: LauncherState, scope: StudyScope): LauncherState {
	const normalized = state.result ? normalizeScope(scope, state.result.catalog) : cloneScope(scope);
	return sameScope(state.scope, normalized) ? state : { ...state, scope: normalized };
}

function canChangeDeck(state: LauncherState, deckId: string): Deck | null {
	if (state.lockedDeck && state.deckId !== deckId) {
		return null;
	}
	return deckForId(state, deckId);
}

export function createLauncherState(decks: Deck[], request: DeckOpenRequest = { lockedDeck: false }): LauncherState {
	const availableDecks = enabledDecks(decks);
	const override = request.deckOverride;
	const requestedDeck = override ?? availableDecks.find((deck) => deck.id === request.deckId) ?? null;
	const fallbackDeck = request.lockedDeck ? null : availableDecks[0] ?? null;
	const deck = requestedDeck ?? fallbackDeck;
	const unavailable = request.lockedDeck && request.deckId !== undefined && !deck;
	const noDeck = !deck;

	return {
		phase: unavailable || noDeck ? "error" : "loading",
		deckId: deck?.id ?? request.deckId ?? null,
		deck,
		decks: availableDecks,
		lockedDeck: request.lockedDeck,
		persistProgress: request.persistProgress !== false,
		requestId: 0,
		initialScope: request.initialScope ? cloneScope(request.initialScope) : null,
		scope: { ...ALL_SCOPE },
		result: null,
		error: unavailable || noDeck ? { code: "deckUnavailable" } : null,
	};
}

export function reduceLauncherState(state: LauncherState, action: LauncherAction): LauncherState {
	switch (action.type) {
		case "selectDeck": {
			if (action.deckId === state.deckId || state.lockedDeck) return state;
			const deck = deckForId(state, action.deckId);
			if (!deck) return state;
			return {
				...state,
				phase: "loading",
				deckId: deck.id,
				deck,
				initialScope: null,
				scope: { ...ALL_SCOPE },
				result: null,
				error: null,
			};
		}
		case "loading": {
			const deck = canChangeDeck(state, action.deckId);
			if (!deck) return state;
			const deckChanged = state.deckId !== deck.id;
			return {
				...state,
				phase: "loading",
				deckId: deck.id,
				deck,
				requestId: action.requestId,
				initialScope: deckChanged ? null : state.initialScope,
				scope: { ...ALL_SCOPE },
				result: null,
				error: null,
			};
		}
		case "loaded": {
			if (state.phase !== "loading" || state.deckId !== action.deckId || state.requestId !== action.requestId) {
				return state;
			}
			const requestedScope = state.initialScope ?? action.savedScope;
			return {
				...state,
				phase: "choose",
				initialScope: null,
				scope: normalizeScope(requestedScope, action.result.catalog),
				result: action.result,
				error: null,
			};
		}
		case "failed":
			if (state.phase !== "loading" || state.deckId !== action.deckId || state.requestId !== action.requestId) {
				return state;
			}
			return {
				...state,
				phase: "error",
				result: null,
				error: { code: "loadFailed", detail: action.detail },
			};
		case "toggleTable": {
			if (state.phase !== "choose" || !state.result || !catalogKeys(state.result.catalog).includes(action.tableKey)) {
				return state;
			}
			const materialized = materializeTableScope(state.scope, state.result.catalog);
			const selected = new Set(
				materialized.mode === "tables" ? materialized.tableKeys : catalogKeys(state.result.catalog),
			);
			if (selected.has(action.tableKey)) {
				selected.delete(action.tableKey);
			} else {
				selected.add(action.tableKey);
			}
			return withScope(state, {
				mode: "tables",
				tableKeys: catalogKeys(state.result.catalog).filter((key) => selected.has(key)),
			});
		}
		case "selectAllTables":
			if (state.phase !== "choose" || !state.result || state.scope.mode === "all") return state;
			return withScope(state, { ...ALL_SCOPE });
		case "clearTables":
			if (state.phase !== "choose" || !state.result) return state;
			return withScope(state, { mode: "tables", tableKeys: [] });
		case "replaceScope":
			if (state.phase !== "choose" || !state.result) return state;
			return withScope(state, action.scope);
	}
}

export function selectedTableKeys(state: LauncherState): string[] {
	if (!state.result) return [];
	if (state.scope.mode === "all") return catalogKeys(state.result.catalog);
	const normalized = normalizeScope(state.scope, state.result.catalog);
	return normalized.mode === "tables" ? normalized.tableKeys : catalogKeys(state.result.catalog);
}

export function selectedTableCount(state: LauncherState): number {
	return selectedTableKeys(state).length;
}

export function launcherCards(state: LauncherState): Card[] {
	return state.result ? filterCardsByScope(state.result.cards, state.scope) : [];
}

export function launcherWarningCount(state: LauncherState): number {
	return state.result?.diagnostics.length ?? 0;
}

export function canStartSession(state: LauncherState): boolean {
	return state.phase === "choose" && selectedTableCount(state) > 0 && launcherCards(state).length > 0;
}
