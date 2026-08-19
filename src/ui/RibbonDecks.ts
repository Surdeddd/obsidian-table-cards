import type { Deck, RibbonIcon } from "../model";

export interface RibbonSpec {
	deckId: string;
	title: string;
	icon: RibbonIcon;
}

export interface RibbonHost {
	add: (icon: string, title: string, callback: (event: MouseEvent) => void) => HTMLElement;
	openDeck: (deckId: string) => void;
}

export function ribbonSpecs(decks: Deck[]): RibbonSpec[] {
	return decks
		.filter((deck) => deck.enabled && deck.ribbon.visible)
		.map((deck) => ({ deckId: deck.id, title: deck.name, icon: deck.ribbon.icon }));
}

/** Rebuilds dynamic ribbon items solely through Obsidian's public Plugin API. */
export class RibbonDecks {
	private elements: HTMLElement[] = [];

	constructor(private readonly host: RibbonHost) {}

	sync(decks: Deck[]): void {
		this.destroy();
		for (const spec of ribbonSpecs(decks)) {
			this.elements.push(this.host.add(spec.icon, spec.title, () => this.host.openDeck(spec.deckId)));
		}
	}

	destroy(): void {
		for (const element of this.elements) element.remove();
		this.elements = [];
	}
}
