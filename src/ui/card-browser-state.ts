import { normalizeSearchText, searchCards, type SearchEntry } from "../deck/filter";
import type { StudyScope, TableCatalogItem } from "../model";

export const CARD_BROWSER_LIMIT = 100;

export interface BrowserMatch {
	entry: SearchEntry;
	snippet: string;
}

export interface BrowserGroup {
	tableKey: string;
	table: TableCatalogItem | null;
	matches: BrowserMatch[];
}

export interface BrowserResults {
	groups: BrowserGroup[];
	shown: number;
	total: number;
}

export function openForRender(
	capturedVersion: number,
	currentVersion: number,
	rowKey: string,
	onOpen: (rowKey: string) => void,
): boolean {
	if (capturedVersion !== currentVersion) return false;
	onOpen(rowKey);
	return true;
}

export function buildTableDisplayLabels(
	catalog: TableCatalogItem[],
	tableOrdinalLabel: (tableNumber: number) => string,
): Map<string, string> {
	const identities = new Map<string, number>();
	for (const table of catalog) {
		const identity = `${table.sourcePath}\u0000${normalizeSearchText(table.label)}`;
		identities.set(identity, (identities.get(identity) ?? 0) + 1);
	}
	return new Map(catalog.map((table) => {
		const identity = `${table.sourcePath}\u0000${normalizeSearchText(table.label)}`;
		const label = (identities.get(identity) ?? 0) > 1
			? `${table.label} · ${tableOrdinalLabel(table.tableNumber)}`
			: table.label;
		return [table.key, label];
	}));
}

function inScope(entry: SearchEntry, scope: StudyScope): boolean {
	return scope.mode === "all" || scope.tableKeys.includes(entry.card.origin.tableKey);
}

export function matchingSnippet(entry: SearchEntry, query: string, limit = 160): string {
	const needle = normalizeSearchText(query);
	const values = Object.values(entry.card.cells).map((cell) => cell.text).filter((value) => value.trim());
	const value = (needle
		? values.find((value) => normalizeSearchText(value).includes(needle))
		: entry.primary || values[0])?.replace(/\s+/g, " ").trim() ?? "";
	const characters = Array.from(value);
	if (characters.length <= limit) return value;
	const hit = needle ? normalizeSearchText(value).indexOf(needle) : 0;
	const start = Math.min(Math.max(0, hit - Math.floor(limit * 0.38)), characters.length - limit);
	const excerpt = characters.slice(start, start + limit).join("").trim();
	return `${start > 0 ? "…" : ""}${excerpt}${start + limit < characters.length ? "…" : ""}`;
}

export function browserResults(
	index: SearchEntry[],
	catalog: TableCatalogItem[],
	scope: StudyScope,
	query: string,
): BrowserResults {
	const scoped = index.filter((entry) => inScope(entry, scope));
	const result = searchCards(scoped, query, CARD_BROWSER_LIMIT);
	const tables = new Map(catalog.map((table) => [table.key, table]));
	const groups: BrowserGroup[] = [];
	for (const entry of result.matches) {
		const tableKey = entry.card.origin.tableKey;
		let group = groups.at(-1);
		if (!group || group.tableKey !== tableKey) {
			group = { tableKey, table: tables.get(tableKey) ?? null, matches: [] };
			groups.push(group);
		}
		group.matches.push({ entry, snippet: matchingSnippet(entry, query) });
	}
	return { groups, shown: result.matches.length, total: result.total };
}
