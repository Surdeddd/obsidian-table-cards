import type { DeckLoadResult, DeckSource } from "../model";
import type { DeckScanResult } from "../deck/catalog";
import {
	sourceTopologyKey,
	TopologyCache,
	type TopologyCacheLoad,
} from "../deck/topology-cache";

export { sourceTopologyKey } from "../deck/topology-cache";

export type SetupScanLoad = TopologyCacheLoad<DeckScanResult, DeckLoadResult>;

export class SetupScanCache {
	private readonly cache: TopologyCache<DeckSource[], DeckScanResult, DeckLoadResult>;

	constructor(
		scanSources: (sources: DeckSource[]) => Promise<DeckScanResult>,
		buildResult: (sources: DeckSource[], scan: DeckScanResult) => DeckLoadResult,
	) {
		this.cache = new TopologyCache(sourceTopologyKey, scanSources, buildResult);
	}

	load(sources: DeckSource[]): Promise<SetupScanLoad> {
		return this.cache.load(sources);
	}

	invalidate(): void {
		this.cache.invalidate();
	}
}
