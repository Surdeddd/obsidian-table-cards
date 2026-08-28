import type { CardBlock, Deck, TableCatalogItem, TableLayout } from "../model";
import { matchStaleTables, parseTableKey, type TableIdentity } from "./table-identity";

export interface RepairedTableLayouts {
	layouts: TableLayout[];
	changed: boolean;
}

export function tableLayoutOf(deck: Deck, tableKey: string): TableLayout | null {
	return deck.tableLayouts.find((layout) => layout.tableKey === tableKey) ?? null;
}

export function blocksForTable(deck: Deck, tableKey: string): CardBlock[] {
	return tableLayoutOf(deck, tableKey)?.blocks ?? deck.blocks;
}

function identityOf(item: TableCatalogItem): TableIdentity {
	return {
		path: item.sourcePath,
		signature: item.selector.headerSignature,
		occurrence: item.selector.occurrence,
	};
}

function matchLayouts(
	layouts: readonly TableLayout[],
	catalog: readonly TableCatalogItem[],
): (TableCatalogItem | null)[] {
	const targets = layouts.map((layout) => parseTableKey(layout.tableKey));
	const known = targets.filter((identity): identity is TableIdentity => identity !== null);
	const matched = matchStaleTables(known, catalog.map(identityOf));
	let cursor = 0;
	return targets.map((identity) => {
		if (identity === null) return null;
		const index = matched[cursor];
		cursor += 1;
		return index === null || index === undefined ? null : (catalog[index] ?? null);
	});
}

export function resolveTableLayouts(
	deck: Deck,
	catalog: readonly TableCatalogItem[],
): Map<string, CardBlock[]> {
	const matches = matchLayouts(deck.tableLayouts, catalog);
	const resolved = new Map<string, CardBlock[]>();
	deck.tableLayouts.forEach((layout, index) => {
		const item = matches[index];
		if (!item || resolved.has(item.key)) return;
		resolved.set(item.key, layout.blocks);
	});
	return resolved;
}

export function tableBlockResolver(
	deck: Deck,
	catalog: readonly TableCatalogItem[],
): (tableKey: string) => CardBlock[] {
	const resolved = resolveTableLayouts(deck, catalog);
	return (tableKey) => resolved.get(tableKey) ?? deck.blocks;
}

export function repairTableLayouts(
	deck: Deck,
	catalog: readonly TableCatalogItem[],
): RepairedTableLayouts {
	const matches = matchLayouts(deck.tableLayouts, catalog);
	const taken = new Set<string>();
	let changed = false;
	const layouts = deck.tableLayouts.map((layout, index) => {
		const item = matches[index];
		if (!item || taken.has(item.key)) return layout;
		taken.add(item.key);
		if (item.key === layout.tableKey && item.label === layout.label) return layout;
		changed = true;
		return { ...layout, tableKey: item.key, label: item.label };
	});
	return { layouts, changed };
}
