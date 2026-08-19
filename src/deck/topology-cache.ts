import type { DeckSource } from "../model";

export type TopologyCacheLoad<TScan, TResult> =
	| { status: "current"; result: TResult; scan: TScan }
	| { status: "stale" };

export function sourceTopologyKey(sources: DeckSource[]): string {
	return JSON.stringify(sources.map(({ id, kind, path }) => [id, kind, path.trim()]));
}

export class TopologyCache<TInput, TScan, TResult> {
	private version = 0;
	private topology = "";
	private scan: TScan | null = null;
	private pending: Promise<TScan> | null = null;

	constructor(
		private readonly keyFor: (input: TInput) => string,
		private readonly scanInput: (input: TInput) => Promise<TScan>,
		private readonly buildResult: (input: TInput, scan: TScan) => TResult,
	) {}

	async load(input: TInput): Promise<TopologyCacheLoad<TScan, TResult>> {
		const requestVersion = ++this.version;
		const topology = this.keyFor(input);
		if (topology !== this.topology) {
			this.topology = topology;
			this.scan = null;
			this.pending = this.scanInput(input);
		}
		const scan = this.scan ?? await this.pending;
		if (requestVersion !== this.version || topology !== this.topology || !scan) {
			return { status: "stale" };
		}
		this.scan = scan;
		this.pending = null;
		return { status: "current", scan, result: this.buildResult(input, scan) };
	}

	invalidate(): void {
		this.version += 1;
		this.topology = "";
		this.scan = null;
		this.pending = null;
	}
}
