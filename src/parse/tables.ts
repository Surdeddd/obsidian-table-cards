import type { Card, CellValue } from "../model";
import { parseCell, stripMarkdownText } from "./cells";
import { normalizeHeader, scanMarkdownTables } from "./table-scanner";

export { detectCellType, parseCell, parseImageRefs, stripImageSyntax, stripMarkdownText } from "./cells";
export {
	headerSignature,
	isSeparatorRow,
	normalizeHeader,
	scanMarkdownTables,
	splitTableRow,
	tableSelector,
} from "./table-scanner";

export function cleanCell(text: string): string {
	return stripMarkdownText(text);
}

export function cellValues(cells: Record<string, CellValue>, columns: string[]): string[] {
	const byNorm = new Map<string, CellValue>();
	for (const [header, value] of Object.entries(cells)) {
		byNorm.set(normalizeHeader(header), value);
	}
	const values: string[] = [];
	const seen = new Set<string>();
	for (const column of columns) {
		const key = normalizeHeader(column);
		const value = byNorm.get(key);
		if (!value?.text || seen.has(key)) {
			continue;
		}
		seen.add(key);
		values.push(value.text);
	}
	return values;
}

export function listTableHeaders(markdown: string): string[] {
	const seen = new Set<string>();
	const headers: string[] = [];
	for (const table of scanMarkdownTables(markdown)) {
		for (const header of table.headers) {
			const key = normalizeHeader(header);
			if (!key || seen.has(key)) {
				continue;
			}
			seen.add(key);
			headers.push(header);
		}
	}
	return headers;
}

export function parseMarkdownTables(markdown: string, sourcePath = ""): Card[] {
	const cards: Card[] = [];
	for (const table of scanMarkdownTables(markdown, sourcePath)) {
		for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
			cards.push({
				cells: table.rows[rowIndex] ?? {},
				headers: table.headers.slice(),
				sourcePath,
				tableSelector: table.selector,
				rowIndex: table.rowNumbers[rowIndex] ?? rowIndex + 1,
			});
		}
	}
	return cards;
}

export function isCardEmpty(card: Card, keyColumns: string[]): boolean {
	if (keyColumns.length === 0) {
		return Object.values(card.cells).every((value) => !value.text);
	}
	return cellValues(card.cells, keyColumns).length === 0;
}

export function emptyCell(): CellValue {
	return parseCell("");
}
