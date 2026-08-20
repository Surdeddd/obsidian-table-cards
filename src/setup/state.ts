import {
	cloneJson,
	type ColumnDataType,
	type ColumnProfile,
	type DeckLoadResult,
	type DeckSource,
	type PluginSettings,
	type RibbonIcon,
} from "../model";
import { normalizeHeader } from "../parse/tables";
import { resolveCard } from "../layout/resolve";
import { createDeck } from "../settings/defaults";
import { blocksForPreset, type PresetId } from "./presets";
import type { DeckScanResult } from "../deck/catalog";

export type SetupStep = "data" | "preset" | "finish";

export interface SetupState {
	step: SetupStep;
	sources: DeckSource[];
	scan: DeckScanResult | null;
	result: DeckLoadResult | null;
	presetId: PresetId | null;
	deckName: string;
	ribbonVisible: boolean;
	ribbonIcon: RibbonIcon;
	dirty: boolean;
}

export type SetupAction =
	| { type: "replaceSources"; sources: DeckSource[] }
	| { type: "loadStarted"; preserveScan: boolean }
	| { type: "loadFailed" }
	| { type: "replaceResult"; result: DeckLoadResult | null; scan: DeckScanResult | null }
	| { type: "selectPreset"; presetId: PresetId }
	| { type: "setDeckName"; name: string }
	| { type: "setRibbonVisible"; visible: boolean }
	| { type: "setRibbonIcon"; icon: RibbonIcon }
	| { type: "next" }
	| { type: "back" };

export interface SetupIdentifiers {
	deckId: string;
	seed: number;
}

export function createSetupState(existingDeckCount = 0): SetupState {
	return {
		step: "data",
		sources: [],
		scan: null,
		result: null,
		presetId: null,
		deckName: "",
		ribbonVisible: existingDeckCount === 0,
		ribbonIcon: "layers-3",
		dirty: false,
	};
}

function hasUsableData(state: SetupState): boolean {
	return (
		state.sources.length > 0 &&
		Boolean(state.result?.catalog.length) &&
		Boolean(state.result?.cards.length)
	);
}

export function canFinishSetup(state: SetupState): boolean {
	return Boolean(state.deckName.trim()) && hasValidSetupRepresentative(state);
}

export function hasValidSetupRepresentative(state: SetupState): boolean {
	if (!hasUsableData(state) || !state.result || !state.presetId) return false;
	const blocks = blocksForPreset(state.presetId, state.result.profiles, state.result.cards[0]);
	return state.result.cards.some((card) => resolveCard(card, blocks).skipReason === null);
}

export function canAdvanceSetup(state: SetupState): boolean {
	if (state.step === "data") return hasUsableData(state);
	if (state.step === "preset") return hasValidSetupRepresentative(state);
	return canFinishSetup(state);
}

export function shouldAutoOpenSetup(settings: PluginSettings): boolean {
	return settings.setupVersion === 0;
}

export function shouldOpenSetupForCards(settings: PluginSettings): boolean {
	return settings.decks.length === 0;
}

export function everyDeckOff(settings: PluginSettings): boolean {
	return settings.decks.length > 0 && !settings.decks.some((deck) => deck.enabled);
}

export function reduceSetupState(state: SetupState, action: SetupAction): SetupState {
	switch (action.type) {
		case "replaceSources":
			return { ...state, sources: action.sources.map(cloneJson), result: null, dirty: true };
		case "loadStarted":
			return { ...state, result: null, scan: action.preserveScan ? state.scan : null };
		case "loadFailed":
			return { ...state, result: null, scan: null };
		case "replaceResult":
			return { ...state, result: action.result, scan: action.scan };
		case "selectPreset":
			return { ...state, presetId: action.presetId, dirty: true };
		case "setDeckName":
			return { ...state, deckName: action.name, dirty: true };
		case "setRibbonVisible":
			return { ...state, ribbonVisible: action.visible, dirty: true };
		case "setRibbonIcon":
			return { ...state, ribbonIcon: action.icon, dirty: true };
		case "next":
			if (state.step === "data" && canAdvanceSetup(state)) return { ...state, step: "preset" };
			if (state.step === "preset" && canAdvanceSetup(state)) return { ...state, step: "finish" };
			return state;
		case "back":
			if (state.step === "finish") return { ...state, step: "preset" };
			if (state.step === "preset") return { ...state, step: "data" };
			return state;
	}
}

export function finishSetup(
	settings: PluginSettings,
	state: SetupState,
	profiles: ColumnProfile[],
	identifiers: SetupIdentifiers,
): PluginSettings {
	if (!canFinishSetup(state) || !state.presetId) {
		throw new Error("Setup draft is incomplete");
	}
	const next = cloneJson(settings);
	const columnTypes: Record<string, ColumnDataType> = {};
	for (const profile of profiles) columnTypes[normalizeHeader(profile.header)] = profile.inferredType;
	const deck = createDeck({
		id: identifiers.deckId,
		name: state.deckName.trim(),
		enabled: true,
		sources: state.sources,
		blocks: blocksForPreset(state.presetId, profiles, state.result?.cards[0]),
		columnTypes,
		shuffleDefault: false,
		ribbon: { visible: state.ribbonVisible, icon: state.ribbonIcon },
	});
	next.setupVersion = 1;
	next.decks.push(deck);
	next.lastDeckId = deck.id;
	next.perDeck[deck.id] = {
		index: 0,
		shuffle: deck.shuffleDefault,
		seed: identifiers.seed,
		scope: { mode: "all" },
		cardKey: null,
	};
	return next;
}
