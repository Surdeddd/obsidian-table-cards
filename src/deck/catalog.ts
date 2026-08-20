import type {
	CardOrigin,
	CellValue,
	DeckDiagnostic,
	ParsedTable,
	TableCatalogItem,
	TableSelector,
} from "../model";
import { normalizeHeader } from "../parse/table-scanner";
import { lastOf } from "../util/lists";

export interface SourceTableEntry {
	sourceId: string;
	table: ParsedTable;
}

export interface CanonicalTable extends TableCatalogItem {
	table: ParsedTable;
}

export interface DeckLoadOptions {
	untitledTableLabel?: (ordinal: number) => string;
}

export interface DeckScanResult {
	tables: CanonicalTable[];
	diagnostics: DeckDiagnostic[];
}

export function stableHash(value: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
	}
	return (hash >>> 0).toString(36);
}

export function tableKey(sourcePath: string, selector: TableSelector): string {
	return `${sourcePath}\u0000${selector.headerSignature}\u0000${selector.occurrence}`;
}

export function tableLabel(
	table: ParsedTable,
	untitledTableLabel: (ordinal: number) => string = (ordinal) => `Table ${ordinal}`,
): string {
	return lastOf(table.headingPath) || untitledTableLabel(table.index + 1);
}

function canonicalRow(cells: Record<string, CellValue>): string {
	return Object.entries(cells)
		.map(
			([header, cell]) =>
				`${normalizeHeader(header)}=${cell.raw.normalize("NFKC").replace(/\s+/g, " ").trim()}`,
		)
		.join("\u001f");
}

export function rowKey(
	tableKeyValue: string,
	cells: Record<string, CellValue>,
	duplicateOrdinal: number,
): string {
	return `row-${stableHash(`${tableKeyValue}\u001e${canonicalRow(cells)}\u001e${duplicateOrdinal}`)}`;
}

export function canonicalizeTables(
	entries: SourceTableEntry[],
	options: DeckLoadOptions = {},
): CanonicalTable[] {
	const byKey = new Map<string, CanonicalTable>();
	for (const { sourceId, table } of entries) {
		const key = tableKey(table.sourcePath, table.selector);
		const existing = byKey.get(key);
		if (existing) {
			if (!existing.sourceIds.includes(sourceId)) {
				existing.sourceIds.push(sourceId);
			}
			continue;
		}
		byKey.set(key, {
			key,
			selector: table.selector,
			sourcePath: table.sourcePath,
			sourceIds: [sourceId],
			label: tableLabel(table, options.untitledTableLabel),
			tableNumber: table.index + 1,
			headingPath: table.headingPath.slice(),
			headers: table.headers.slice(),
			rowCount: table.rows.length,
			table,
		});
	}
	return Array.from(byKey.values());
}

export function cardOrigins(
	table: ParsedTable,
	untitledTableLabel?: (ordinal: number) => string,
): CardOrigin[] {
	const key = tableKey(table.sourcePath, table.selector);
	const label = tableLabel(table, untitledTableLabel);
	const duplicates = new Map<string, number>();
	return table.rows.map((cells, index) => {
		const canonical = canonicalRow(cells);
		const duplicateOrdinal = duplicates.get(canonical) ?? 0;
		duplicates.set(canonical, duplicateOrdinal + 1);
		return {
			tableKey: key,
			tableLabel: label,
			tableNumber: table.index + 1,
			sourcePath: table.sourcePath,
			rowNumber: table.rowNumbers[index] ?? index + 1,
			rowKey: rowKey(key, cells, duplicateOrdinal),
		};
	});
}
