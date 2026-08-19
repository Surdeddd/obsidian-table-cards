import type { DeckSource, ParsedTable, TableSelector } from "../model";

export function normalizeVaultPath(path: string): string {
	return path.trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+/, "");
}

export function selectorMatchesTable(selector: TableSelector, table: ParsedTable): boolean {
	return (
		selector.headerSignature === table.selector.headerSignature &&
		selector.occurrence === table.selector.occurrence &&
		(selector.sourcePath === undefined || normalizeVaultPath(selector.sourcePath) === normalizeVaultPath(table.sourcePath))
	);
}

export function selectorForTable(source: DeckSource, table: ParsedTable): TableSelector {
	return source.kind === "folder"
		? { ...table.selector, sourcePath: normalizeVaultPath(table.sourcePath) }
		: { ...table.selector };
}

export function sameStoredSelector(left: TableSelector, right: TableSelector): boolean {
	return (
		left.headerSignature === right.headerSignature &&
		left.occurrence === right.occurrence &&
		(left.sourcePath === undefined
			? right.sourcePath === undefined
			: right.sourcePath !== undefined && normalizeVaultPath(left.sourcePath) === normalizeVaultPath(right.sourcePath))
	);
}

export function selectorDiagnosticDetail(selector: TableSelector): string {
	const identity = `${selector.headerSignature}:${selector.occurrence}`;
	return selector.sourcePath === undefined ? identity : `${normalizeVaultPath(selector.sourcePath)}:${identity}`;
}

export function tableSelectedBySource(source: DeckSource, table: ParsedTable): boolean {
	return source.tables.mode === "all" || source.tables.selectors.some((selector) => selectorMatchesTable(selector, table));
}

function uniqueTableSelectors(source: DeckSource, tables: ParsedTable[]): TableSelector[] {
	const selectors: TableSelector[] = [];
	for (const table of tables) {
		const candidate = selectorForTable(source, table);
		if (!selectors.some((selector) => sameStoredSelector(selector, candidate))) selectors.push(candidate);
	}
	return selectors;
}

function materializeSelectedTables(source: DeckSource, available: ParsedTable[]): TableSelector[] {
	const selected = uniqueTableSelectors(source, available.filter((table) => tableSelectedBySource(source, table)));
	if (source.tables.mode !== "include") return selected;
	for (const selector of source.tables.selectors) {
		if (available.some((table) => selectorMatchesTable(selector, table))) continue;
		if (!selected.some((item) => sameStoredSelector(item, selector))) selected.push({ ...selector });
	}
	return selected;
}

export function toggleSourceTable(
	source: DeckSource,
	available: ParsedTable[],
	table: ParsedTable,
): DeckSource {
	const selectors = materializeSelectedTables(source, available);
	const target = selectorForTable(source, table);
	const selected = selectors.some((selector) => sameStoredSelector(selector, target));
	return {
		...source,
		tables: {
			mode: "include",
			selectors: selected
				? selectors.filter((selector) => !sameStoredSelector(selector, target))
				: [...selectors, target],
		},
	};
}
