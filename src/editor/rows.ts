import type { Card } from "../model";

export interface RepresentativeRowIndexes {
	first: number;
	longest: number;
	mostEmpty: number;
}

export function representativeRowIndexes(cards: Card[]): RepresentativeRowIndexes {
	let longest = 0;
	let longestLength = -1;
	let mostEmpty = 0;
	let mostEmptyCount = -1;
	for (let index = 0; index < cards.length; index += 1) {
		const cells = Object.values(cards[index]?.cells ?? {});
		const length = cells.reduce((total, cell) => total + cell.raw.length, 0);
		const empty = cells.filter((cell) => cell.raw.trim().length === 0).length;
		if (length > longestLength) {
			longest = index;
			longestLength = length;
		}
		if (empty > mostEmptyCount) {
			mostEmpty = index;
			mostEmptyCount = empty;
		}
	}
	return { first: 0, longest, mostEmpty };
}
