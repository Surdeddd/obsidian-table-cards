import type { Card, StudyScope, TableCatalogItem } from "../model";

export interface SearchEntry {
	card: Card;
	normalized: string;
	primary: string;
}

export interface SearchResult {
	matches: SearchEntry[];
	total: number;
}

function catalogKeys(catalog: TableCatalogItem[]): string[] {
	return Array.from(new Set(catalog.map((table) => table.key)));
}

export function normalizeScope(scope: StudyScope, catalog: TableCatalogItem[]): StudyScope {
	if (scope.mode === "all") {
		return { mode: "all" };
	}
	const requested = new Set(scope.tableKeys);
	return {
		mode: "tables",
		tableKeys: catalogKeys(catalog).filter((key) => requested.has(key)),
	};
}

export function materializeTableScope(scope: StudyScope, catalog: TableCatalogItem[]): StudyScope {
	if (scope.mode === "all") {
		return { mode: "tables", tableKeys: catalogKeys(catalog) };
	}
	return normalizeScope(scope, catalog);
}

export function filterCardsByScope(cards: Card[], scope: StudyScope): Card[] {
	if (scope.mode === "all") {
		return cards.slice();
	}
	const tableKeys = new Set(scope.tableKeys);
	return cards.filter((card) => tableKeys.has(card.origin.tableKey));
}

export function normalizeSearchText(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/\p{M}+/gu, "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

export function buildSearchIndex(cards: Card[]): SearchEntry[] {
	return cards.map((card) => {
		const values = Object.values(card.cells).map((cell) => cell.text);
		return {
			card,
			normalized: normalizeSearchText(values.join("\n")),
			primary: values.find((value) => value.trim()) ?? "",
		};
	});
}

export function searchCards(index: SearchEntry[], query: string, limit = 100): SearchResult {
	const needle = normalizeSearchText(query);
	const matches = needle ? index.filter((entry) => entry.normalized.includes(needle)) : index;
	return { matches: matches.slice(0, limit), total: matches.length };
}

export function restoreCardIndex(cards: Card[], cardKey: string | null, savedIndex: number): number {
	const exactIndex = cardKey ? cards.findIndex((card) => card.origin.rowKey === cardKey) : -1;
	if (exactIndex >= 0) {
		return exactIndex;
	}
	if (cards.length === 0) {
		return 0;
	}
	return Math.min(Math.max(savedIndex, 0), cards.length - 1);
}
