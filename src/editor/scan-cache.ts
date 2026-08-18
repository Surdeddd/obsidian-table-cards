import type { Deck, DeckLoadResult, DeckSource } from "../model";
import type { DeckScanResult } from "../deck/catalog";
import {
	sourceTopologyKey,
	TopologyCache,
	type TopologyCacheLoad,
} from "../deck/topology-cache";

export type EditorScanLoad = TopologyCacheLoad<DeckScanResult, DeckLoadResult>;

export const editorSourceTopologyKey = sourceTopologyKey;

export class EditorScanCache {
	private readonly cache: TopologyCache<Deck, DeckScanResult, DeckLoadResult>;

	constructor(
		scanSources: (sources: DeckSource[]) => Promise<DeckScanResult>,
		buildResult: (deck: Deck, scan: DeckScanResult) => DeckLoadResult,
	) {
		this.cache = new TopologyCache(
			(deck) => editorSourceTopologyKey(deck.sources),
			(deck) => scanSources(deck.sources),
			buildResult,
		);
	}

	load(deck: Deck): Promise<EditorScanLoad> {
		return this.cache.load(deck);
	}

	invalidate(): void {
		this.cache.invalidate();
	}
}
