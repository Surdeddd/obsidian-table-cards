import type { DeckScanResult } from "../deck/catalog";
import { tableSelectedBySource } from "../deck/selectors";
import { formatUiNumber, type Translator } from "../i18n";
import type { DeckSource, ParsedTable, UiLocale } from "../model";

export function canonicalTablesForSource(
	scan: DeckScanResult | null,
	sourceId: string,
): ParsedTable[] {
	return scan?.tables
		.filter((table) => table.sourceIds.includes(sourceId))
		.map((table) => table.table) ?? [];
}

export function sourceTableSummary(
	source: DeckSource,
	tables: ParsedTable[],
	t: Translator,
	locale: UiLocale,
): string {
	if (tables.length === 0) return t("editor.table.none");
	const selected = source.tables.mode === "all"
		? tables.length
		: tables.filter((table) => tableSelectedBySource(source, table)).length;
	if (source.tables.mode === "all") {
		return t("editor.source.summaryAll", { count: formatUiNumber(tables.length, locale) });
	}
	if (selected === 0) return t("editor.source.summaryNone");
	return t("editor.source.summarySome", {
		selected: formatUiNumber(selected, locale),
		total: formatUiNumber(tables.length, locale),
	});
}
