import type { DeckLoadResult, DeckSource } from "../model";
import type { DeckScanResult } from "../deck/catalog";

export type SetupScanLoad =
	| { status: "current"; result: DeckLoadResult; scan: DeckScanResult }
	| { status: "stale" };

export function sourceTopologyKey(sources: DeckSource[]): string {
	return JSON.stringify(sources.map(({ id, kind, path }) => [id, kind, path.trim()]));
}

export class SetupScanCache {
	private version = 0;
	private topology = "";
	private scan: DeckScanResult | null = null;
	private pending: Promise<DeckScanResult> | null = null;

	constructor(
		private readonly scanSources: (sources: DeckSource[]) => Promise<DeckScanResult>,
		private readonly buildResult: (sources: DeckSource[], scan: DeckScanResult) => DeckLoadResult,
	) {}

	async load(sources: DeckSource[]): Promise<SetupScanLoad> {
		const requestVersion = ++this.version;
		const topology = sourceTopologyKey(sources);
		if (topology !== this.topology) {
			this.topology = topology;
			this.scan = null;
			this.pending = this.scanSources(sources);
		}
		const scan = this.scan ?? await this.pending;
		if (requestVersion !== this.version || topology !== this.topology || !scan) {
			return { status: "stale" };
		}
		this.scan = scan;
		this.pending = null;
		return { status: "current", scan, result: this.buildResult(sources, scan) };
	}

	invalidate(): void {
		this.version += 1;
		this.topology = "";
		this.scan = null;
		this.pending = null;
	}
}
