import { describe, expect, it } from "vitest";
import { buildCardImageCache } from "../src/ui/card-image-cache";
import { resolveCardImageSource } from "../src/ui/CardView";
import { createBlock, type Card } from "../src/model";
import { parseCell } from "../src/parse/tables";

function card(rowKey: string, raw: string): Card {
	return {
		cells: { Image: parseCell(raw) },
		headers: ["Image"],
		origin: {
			tableKey: "images",
			tableLabel: "Images",
			tableNumber: 1,
			sourcePath: "Deck/cards.md",
			rowNumber: 3,
			rowKey,
		},
	};
}

describe("card image cache", () => {
	it("resolves each active local image once and serves later renders without resolver calls", () => {
		const cards = [card("one", "![[photo.png]]"), card("two", "![[photo.png]]")];
		const imageBlock = createBlock({ kind: "image", columns: ["Image"] });
		const calls: string[] = [];
		const cache = buildCardImageCache(cards, [imageBlock], (sourcePath, image) => {
			calls.push(`${sourcePath}:${image.source}`);
			return "app://vault/photo.png";
		});
		const image = cards[0]!.cells.Image!.images[0]!;

		expect(calls).toEqual(["Deck/cards.md:photo.png"]);
		expect(cache.resolve("Deck/cards.md", image)).toBe("app://vault/photo.png");
		expect(cache.resolve("Deck/cards.md", image)).toBe("app://vault/photo.png");
		expect(calls).toEqual(["Deck/cards.md:photo.png"]);
	});

	it("uses the injected lifetime cache without touching the fallback app on later renders", () => {
		const cards = [card("one", "![[photo.png]]")];
		const image = cards[0]!.cells.Image!.images[0]!;
		let initialLookups = 0;
		const cache = buildCardImageCache(cards, [createBlock({ kind: "image", columns: ["Image"] })], () => {
			initialLookups += 1;
			return "app://vault/photo.png";
		});
		let fallbackLookups = 0;
		const app = {
			metadataCache: { getFirstLinkpathDest: () => { fallbackLookups += 1; return null; } },
			vault: {
				getAbstractFileByPath: () => { fallbackLookups += 1; return null; },
				getResourcePath: () => { fallbackLookups += 1; return ""; },
			},
		};

		for (let render = 0; render < 3; render += 1) {
			expect(resolveCardImageSource({
				app,
				resolveImageSource: (sourcePath, ref) => cache.resolve(sourcePath, ref),
			} as never, "Deck/cards.md", image)).toBe("app://vault/photo.png");
		}
		expect(initialLookups).toBe(1);
		expect(fallbackLookups).toBe(0);
	});
});
