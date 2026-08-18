import { TFile, TFolder, type App } from "obsidian";
import type {
	Card,
	Deck,
	DeckDiagnostic,
	DeckLoadResult,
	DeckSource,
	ImageRef,
	ParsedTable,
} from "../model";
import { resolveCard } from "../layout/resolve";
import { normalizeHeader, scanMarkdownTables } from "../parse/tables";
import { profileColumns } from "../parse/profile";
import { shuffleItems, wrapIndex } from "./shuffle";

interface SelectedSource {
	source: DeckSource;
	file: TFile;
}

function sourceFiles(app: App, source: DeckSource, diagnostics: DeckDiagnostic[]): TFile[] {
	const path = source.path.trim();
	const entry = path ? app.vault.getAbstractFileByPath(path) : null;
	if (source.kind === "file" && entry instanceof TFile && entry.extension.toLocaleLowerCase() === "md") {
		return [entry];
	}
	if (source.kind === "folder" && entry instanceof TFolder) {
		return entry.children.filter(
			(child): child is TFile => child instanceof TFile && child.extension.toLocaleLowerCase() === "md",
		);
	}
	diagnostics.push({
		code: "sourceMissing",
		sourcePath: path,
		detail: source.kind,
	});
	return [];
}

function matchingTables(source: DeckSource, tables: ParsedTable[]): ParsedTable[] {
	const selection = source.tables;
	if (selection.mode === "all") {
		return tables;
	}
	return tables.filter(
		(table) =>
			selection.selectors.some(
				(selector) =>
					table.selector.headerSignature === selector.headerSignature &&
					table.selector.occurrence === selector.occurrence,
			),
	);
}

function addHeaderDiagnostics(table: ParsedTable, diagnostics: DeckDiagnostic[]): void {
	const seen = new Set<string>();
	for (let index = 0; index < table.rawHeaders.length; index += 1) {
		const rawHeader = table.rawHeaders[index] ?? "";
		const normalized = normalizeHeader(rawHeader);
		if (!normalized) {
			diagnostics.push({
				code: "emptyHeader",
				sourcePath: table.sourcePath,
				tableIndex: table.index,
				detail: String(index + 1),
			});
			continue;
		}
		if (seen.has(normalized)) {
			diagnostics.push({
				code: "duplicateHeader",
				sourcePath: table.sourcePath,
				tableIndex: table.index,
				detail: rawHeader,
			});
		}
		seen.add(normalized);
	}
}

export function resolveImageFile(app: App, sourcePath: string, image: ImageRef | string): TFile | null {
	const linkpath = typeof image === "string" ? image : image.source;
	const linked = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
	if (linked instanceof TFile) {
		return linked;
	}
	const direct = app.vault.getAbstractFileByPath(linkpath);
	return direct instanceof TFile ? direct : null;
}

function tableCards(table: ParsedTable): Card[] {
	return table.rows.map((cells, index) => ({
		cells,
		headers: table.headers.slice(),
		sourcePath: table.sourcePath,
		tableSelector: table.selector,
		rowIndex: table.rowNumbers[index] ?? index + 1,
	}));
}

function addImageDiagnostics(app: App, table: ParsedTable, diagnostics: DeckDiagnostic[]): void {
	for (let index = 0; index < table.rows.length; index += 1) {
		const row = table.rows[index];
		if (!row) {
			continue;
		}
		for (const cell of Object.values(row)) {
			for (const image of cell.images) {
				if (image.external || resolveImageFile(app, table.sourcePath, image)) {
					continue;
				}
				diagnostics.push({
					code: "brokenImage",
					sourcePath: table.sourcePath,
					tableIndex: table.index,
					rowIndex: table.rowNumbers[index] ?? index + 1,
					detail: image.source,
				});
			}
		}
	}
}

export function deckFilePaths(app: App, deck: Deck): string[] {
	const paths = new Set<string>();
	const diagnostics: DeckDiagnostic[] = [];
	for (const source of deck.sources) {
		for (const file of sourceFiles(app, source, diagnostics)) {
			paths.add(file.path);
		}
	}
	return Array.from(paths);
}

export async function scanDeckTables(app: App, sources: DeckSource[]): Promise<ParsedTable[]> {
	const diagnostics: DeckDiagnostic[] = [];
	const reads = new Map<string, Promise<string>>();
	const tables: ParsedTable[] = [];
	for (const source of sources) {
		for (const file of sourceFiles(app, source, diagnostics)) {
			const pending = reads.get(file.path) ?? app.vault.cachedRead(file);
			reads.set(file.path, pending);
			tables.push(...scanMarkdownTables(await pending, file.path));
		}
	}
	return tables;
}

export async function loadDeckData(app: App, deck: Deck): Promise<DeckLoadResult> {
	const diagnostics: DeckDiagnostic[] = [];
	const selectedSources: SelectedSource[] = [];
	for (const source of deck.sources) {
		for (const file of sourceFiles(app, source, diagnostics)) {
			selectedSources.push({ source, file });
		}
	}

	const reads = new Map<string, Promise<string>>();
	const selectedTables: ParsedTable[] = [];
	const selectedTableKeys = new Set<string>();
	for (const { source, file } of selectedSources) {
		const pending = reads.get(file.path) ?? app.vault.cachedRead(file);
		reads.set(file.path, pending);
		const tables = scanMarkdownTables(await pending, file.path);
		const selected = matchingTables(source, tables);
		if (source.tables.mode === "include") {
			for (const selector of source.tables.selectors) {
				if (selected.some((table) =>
					table.selector.headerSignature === selector.headerSignature && table.selector.occurrence === selector.occurrence,
				)) continue;
				diagnostics.push({
					code: "tableMissing",
					sourcePath: file.path,
					detail: `${selector.headerSignature}:${selector.occurrence}`,
				});
			}
		}
		for (const table of selected) {
			const tableKey = `${file.path}\u0000${table.selector.headerSignature}\u0000${table.selector.occurrence}`;
			if (selectedTableKeys.has(tableKey)) continue;
			selectedTableKeys.add(tableKey);
			selectedTables.push(table);
			addHeaderDiagnostics(table, diagnostics);
			addImageDiagnostics(app, table, diagnostics);
		}
	}

	const sourcePaths = Array.from(new Set(selectedTables.map((table) => table.sourcePath)));
	const profiles = profileColumns(selectedTables, deck.columnTypes, {
		isImageResolvable: (source) =>
			sourcePaths.some((sourcePath) => resolveImageFile(app, sourcePath, source) !== null),
	});
	const cards: Card[] = [];
	for (const card of selectedTables.flatMap(tableCards)) {
		const resolved = resolveCard(card, deck.blocks);
		if (!resolved.skipReason) {
			cards.push(card);
			continue;
		}
		const table = selectedTables.find(
			(candidate) =>
				candidate.sourcePath === card.sourcePath &&
				candidate.selector.headerSignature === card.tableSelector.headerSignature &&
				candidate.selector.occurrence === card.tableSelector.occurrence,
		);
		diagnostics.push({
			code: "requiredEmpty",
			sourcePath: card.sourcePath,
			tableIndex: table?.index,
			rowIndex: card.rowIndex,
			detail: resolved.skipReason.blockId,
		});
	}
	return {
		cards,
		tables: selectedTables,
		profiles,
		diagnostics,
	};
}

export async function loadDeckCards(app: App, deck: Deck): Promise<Card[]> {
	return (await loadDeckData(app, deck)).cards;
}

export async function loadDeckHeaders(app: App, deck: Deck): Promise<string[]> {
	return (await loadDeckData(app, deck)).profiles.map((profile) => profile.header);
}

export function orderCards(cards: Card[], shuffle: boolean, seed: number): Card[] {
	return shuffle ? shuffleItems(cards, seed) : cards.slice();
}

export function clampCardIndex(index: number, total: number): number {
	return total <= 0 ? 0 : wrapIndex(index, total);
}
