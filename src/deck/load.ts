import { TFile, TFolder, type App } from "obsidian";
import type {
	Card,
	Deck,
	DeckDiagnostic,
	DeckLoadResult,
	DeckSource,
	ImageRef,
	ParsedTable,
	TableCatalogItem,
	TableSelector,
} from "../model";
import { resolveCard } from "../layout/resolve";
import { normalizeHeader, scanMarkdownTables } from "../parse/tables";
import { profileColumns } from "../parse/profile";
import {
	canonicalizeTables,
	cardOrigins,
	type CanonicalTable,
	type DeckLoadOptions,
	type DeckScanResult,
	type SourceTableEntry,
} from "./catalog";
import { shuffleItems, wrapIndex } from "./shuffle";
import { selectorDiagnosticDetail, selectorMatchesTable } from "./selectors";
import { matchStaleTables, type TableIdentity } from "./table-identity";

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

function tableCards(canonical: CanonicalTable): Card[] {
	const origins = cardOrigins(canonical.table);
	return canonical.table.rows.map((cells, index) => ({
		cells,
		headers: canonical.table.headers.slice(),
		origin: { ...origins[index]!, tableLabel: canonical.label },
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
	return (await scanDeckSources(app, sources)).tables.map((item) => item.table);
}

export async function scanDeckSources(
	app: App,
	sources: DeckSource[],
	options: DeckLoadOptions = {},
): Promise<DeckScanResult> {
	const diagnostics: DeckDiagnostic[] = [];
	const files = new Map<string, { file: TFile; sourceIds: Set<string> }>();
	for (const source of sources) {
		for (const file of sourceFiles(app, source, diagnostics)) {
			const entry = files.get(file.path) ?? { file, sourceIds: new Set<string>() };
			entry.sourceIds.add(source.id);
			files.set(file.path, entry);
		}
	}
	const entries: SourceTableEntry[] = [];
	for (const { file, sourceIds } of files.values()) {
		const tables = scanMarkdownTables(await app.vault.cachedRead(file), file.path);
		for (const table of tables) {
			for (const sourceId of sourceIds) {
				entries.push({ sourceId, table });
			}
		}
	}
	return { tables: canonicalizeTables(entries, options), diagnostics };
}

function tableIdentityOf(item: CanonicalTable): TableIdentity {
	return {
		path: item.table.sourcePath,
		signature: item.table.selector.headerSignature,
		occurrence: item.table.selector.occurrence,
	};
}

function selectorIdentity(selector: TableSelector, source: DeckSource): TableIdentity {
	return {
		path: selector.sourcePath ?? (source.kind === "folder" ? null : source.path),
		signature: selector.headerSignature,
		occurrence: selector.occurrence,
	};
}

function selectedKeysForSource(
	source: DeckSource,
	liveTables: CanonicalTable[],
	diagnostics: DeckDiagnostic[],
): Set<string> {
	const keys = new Set<string>();
	if (source.tables.mode !== "include") return keys;

	const taken = new Set<number>();
	const unmatched: TableSelector[] = [];
	for (const selector of source.tables.selectors) {
		let matched = false;
		liveTables.forEach((item, index) => {
			if (!selectorMatchesTable(selector, item.table)) return;
			matched = true;
			taken.add(index);
			keys.add(item.key);
		});
		if (!matched) unmatched.push(selector);
	}

	for (const selector of unmatched) {
		const candidates = liveTables
			.map((item, index) => ({ item, index }))
			.filter((candidate) => !taken.has(candidate.index));
		const [match] = matchStaleTables(
			[selectorIdentity(selector, source)],
			candidates.map((candidate) => tableIdentityOf(candidate.item)),
		);
		const chosen = match === null || match === undefined ? undefined : candidates[match];
		if (!chosen) {
			diagnostics.push({
				code: "tableMissing",
				sourcePath: source.path.trim(),
				detail: selectorDiagnosticDetail(selector),
			});
			continue;
		}
		taken.add(chosen.index);
		keys.add(chosen.item.key);
	}
	return keys;
}

function catalogItem(table: CanonicalTable): TableCatalogItem {
	const { table: _parsed, ...item } = table;
	return item;
}

export function buildDeckDataFromScan(
	app: App,
	deck: Deck,
	scan: DeckScanResult,
): DeckLoadResult {
	const diagnostics = scan.diagnostics.slice();
	const sourcesById = new Map(deck.sources.map((source) => [source.id, source]));
	const selectedKeys = new Map<string, Set<string>>();
	for (const source of deck.sources) {
		if (source.tables.mode !== "include") continue;
		const liveTables = scan.tables.filter((table) => table.sourceIds.includes(source.id));
		selectedKeys.set(source.id, selectedKeysForSource(source, liveTables, diagnostics));
	}
	const selectedCatalog = scan.tables.filter((table) =>
		table.sourceIds.some((sourceId) => {
			const source = sourcesById.get(sourceId);
			if (!source) return false;
			return source.tables.mode === "all" || (selectedKeys.get(sourceId)?.has(table.key) ?? false);
		}),
	);
	const selectedTables = selectedCatalog.map((item) => item.table);
	for (const table of selectedTables) {
		addHeaderDiagnostics(table, diagnostics);
		addImageDiagnostics(app, table, diagnostics);
	}

	const sourcePaths = Array.from(new Set(selectedTables.map((table) => table.sourcePath)));
	const profiles = profileColumns(selectedTables, deck.columnTypes, {
		isImageResolvable: (source) =>
			sourcePaths.some((sourcePath) => resolveImageFile(app, sourcePath, source) !== null),
	});
	const cards: Card[] = [];
	for (const card of selectedCatalog.flatMap(tableCards)) {
		const resolved = resolveCard(card, deck.blocks);
		if (!resolved.skipReason) {
			cards.push(card);
			continue;
		}
		const table = selectedCatalog.find((candidate) => candidate.key === card.origin.tableKey)?.table;
		diagnostics.push({
			code: "requiredEmpty",
			sourcePath: card.origin.sourcePath,
			tableIndex: table?.index,
			rowIndex: card.origin.rowNumber,
			detail: resolved.skipReason.blockId,
		});
	}
	return {
		cards,
		tables: selectedTables,
		catalog: selectedCatalog.map(catalogItem),
		profiles,
		diagnostics,
	};
}

export async function loadDeckData(
	app: App,
	deck: Deck,
	options: DeckLoadOptions = {},
): Promise<DeckLoadResult> {
	const scan = await scanDeckSources(app, deck.sources, options);
	return buildDeckDataFromScan(app, deck, scan);
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
