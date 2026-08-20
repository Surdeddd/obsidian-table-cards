import { resolveCard } from "../layout/resolve";
import type { Card, CardBlock, ImageRef } from "../model";

export type LocalImageResolver = (sourcePath: string, image: ImageRef) => string | null;

function imageKey(sourcePath: string, source: string): string {
	return `${sourcePath}\u0000${source}`;
}

export class CardImageCache {
	constructor(private readonly localSources: ReadonlyMap<string, string | null>) {}

	resolve(sourcePath: string, image: ImageRef): string | null {
		if (image.external) return image.source;
		return this.localSources.get(imageKey(sourcePath, image.source)) ?? null;
	}
}

export function buildCardImageCache(
	cards: Card[],
	blocks: CardBlock[],
	resolveLocal: LocalImageResolver,
): CardImageCache {
	const localSources = new Map<string, string | null>();
	for (const card of cards) {
		for (const resolved of resolveCard(card, blocks).blocks) {
			if (!resolved.visible || resolved.block.kind !== "image") continue;
			for (const value of resolved.values) for (const image of value.images) {
				if (image.external) continue;
				const key = imageKey(card.origin.sourcePath, image.source);
				if (!localSources.has(key)) localSources.set(key, resolveLocal(card.origin.sourcePath, image));
			}
		}
	}
	return new CardImageCache(localSources);
}
